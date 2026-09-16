// 검증 설계. 유저를 나누는 A/B 대신, 전원에게 같은 변경을 적용하고
// 그 변경에 더 노출된 집단과 덜 노출된 집단의 "변화량 차이"로 효과를 읽는다(이중차분).
//
// 이 방식을 쓰는 이유
// - 형평성: 가격·확률·난이도를 유저마다 다르게 주지 않는다. 게임에서 이건 커뮤니티 문제이자 법적 위험이다
// - 교란 통제: 시즌 이벤트나 마케팅 스파이크는 두 집단에 같이 들어오므로 차이를 빼면 상쇄된다
// - 표본: 소규모 팀의 유입으로 A/B를 돌리면 2-3%p 개선을 검출하는 데 한두 달이 걸린다
//
// 숫자는 전부 코드가 계산한다. 아래 표본 계산은 양측 5%, 검정력 80% 기준.

import type { DiagnosisMetrics } from "./engine.ts";

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const num = (n: number) => Math.round(n).toLocaleString("ko-KR");

const Z_ALPHA = 1.959964;
const Z_BETA = 0.8416212;

export type Design = {
  /** 전원에게 동일하게 적용하는 변경 */
  intervention: string;
  /** 변경에 더 노출되는 집단 */
  treated: { label: string; users: number };
  /** 같은 기간 변경의 영향을 덜 받는 집단 */
  control: { label: string; users: number };
  outcome: string;
  /** 관측 기간(변경 전/후 각각)에 필요한 일수 */
  daysPerPeriod: number;
  /** 그 기간으로 검출 가능한 최소 효과 */
  mdePp: number;
  precheck: string;
  confounders: string;
  note?: string;
  /** 이 게임 규모에서 통계적으로 확인 가능한가 */
  feasible: boolean;
  /** 불가능할 때 대신 할 것 */
  fallback?: string;
};

const MAX_DAYS = 60;
const MAX_MDE_PP = 10;

/** 이중차분은 네 칸(전/후 × 영향/비교)의 오차가 합쳐지므로 단순 비교보다 표본이 더 필요하다 */
export function mdePp(baseline: number, perCell: number): number {
  if (perCell <= 0) return 100;
  return (Z_ALPHA + Z_BETA) * 2 * Math.sqrt((baseline * (1 - baseline)) / perCell) * 100;
}

/** 목표 효과를 검출하는 데 필요한 한 칸당 표본 */
export function perCellFor(baseline: number, targetPp: number): number {
  return Math.ceil(((Z_ALPHA + Z_BETA) ** 2 * 4 * baseline * (1 - baseline)) / (targetPp / 100) ** 2);
}

const clampDays = (d: number) => Math.max(3, Math.min(MAX_DAYS, Math.ceil(d)));

/** 하루에 이 집단으로 새로 들어오는 인원 (관측 기간으로 나눈 값) */
function dailyFlow(users: number, observedDays: number) {
  return observedDays > 0 ? users / observedDays : 0;
}

export function buildDesigns(m: DiagnosisMetrics, wallLevel: number | null): Record<string, Design> {
  const days = Math.max(1, (Date.parse(m.meta.obsEnd) - Date.parse(m.meta.obsStart)) / 86_400_000 + 1);
  const out: Record<string, Design> = {};

  // 레벨 벽: 해당 레벨만 조정하고 인접 레벨은 그대로 둔다
  const byLevel = new Map(m.levels.map((l) => [l.level, l]));
  const wall = wallLevel != null ? byLevel.get(wallLevel) : undefined;
  if (wall) {
    const neighbors = [byLevel.get(wall.level - 1), byLevel.get(wall.level + 1)].filter((l) => !!l);
    const controlUsers = neighbors.reduce((s, l) => s + l!.reached, 0);
    const baseline = wall.stuck.rate;
    const flow = dailyFlow(wall.reached, days);
    const per = Math.min(wall.reached, controlUsers);
    out.level_wall = {
      intervention: `레벨 ${wall.level}만 조정하고 인접 레벨은 그대로 둡니다. 모든 유저가 같은 밸런스를 받습니다`,
      treated: { label: `레벨 ${wall.level} 도달자`, users: wall.reached },
      control: { label: neighbors.map((l) => `L${l!.level}`).join(", ") + " 도달자", users: controlUsers },
      outcome: `레벨 N 도달자 중 N+1 미진입률 (현재 L${wall.level} ${pct(baseline)})`,
      daysPerPeriod: clampDays(perCellFor(baseline, 5) / Math.max(flow, 1)),
      mdePp: mdePp(baseline, per),
      precheck: `변경 전 두 집단의 미진입률 격차가 일정했는지 확인 필요. 추세가 벌어지고 있었다면 이중차분 전제가 깨짐`,
      feasible: true,
      confounders: `같은 기간의 시즌 이벤트·마케팅 집행은 두 집단에 함께 들어오므로 차이를 빼면 상쇄. 단 레벨 ${wall.level} 전용 이벤트가 있으면 제외 필요`,
      note: `유입이 적어 기간이 길어지면 인접 레벨을 L${wall.level - 2}까지 넓혀 비교군을 키울 수 있음`,
    };
  }

  // 저사양 최적화: 빌드는 전원에게 나가지만 효과는 저사양에만 나타난다
  const tier = new Map(m.segments.deviceTier.map((t) => [t.key, t]));
  const low = tier.get("low");
  const others = m.segments.deviceTier.filter((t) => t.key !== "low");
  if (low && others.length) {
    const controlUsers = others.reduce((s, t) => s + t.users, 0);
    const baseline = low.d1.rate;
    out.device_perf = {
      intervention: `성능 개선 빌드를 전체에 배포합니다. 기기 등급별로 다른 빌드를 주지 않습니다`,
      treated: { label: "저사양 기기 유저", users: low.users },
      control: { label: "중·고사양 기기 유저", users: controlUsers },
      outcome: `D1 잔존율 (현재 저사양 ${pct(baseline)})`,
      daysPerPeriod: clampDays(perCellFor(baseline, 5) / Math.max(dailyFlow(low.users, days), 1)),
      mdePp: mdePp(baseline, Math.min(low.users, controlUsers)),
      precheck: `변경 전 두 집단의 D1 격차가 일정했는지 확인 필요. 기기 등급 분류 기준을 중간에 바꾸면 안 됨`,
      feasible: true,
      confounders: `배포 직후 구버전 잔류 유저가 섞이므로 앱 버전으로 걸러 신규 설치 코호트만 비교`,
    };
  }

  // 광고 상한: 규칙은 전원 동일하고, 원래 많이 보던 유저만 실제로 영향을 받는다
  const buckets = m.ads.fixedDay.buckets.filter((b) => b.nextDay.den > 0);
  if (buckets.length >= 3) {
    const high = buckets.slice(-2);
    const lowB = buckets.slice(0, -2);
    const treatedN = high.reduce((s, b) => s + b.nextDay.den, 0);
    const controlN = lowB.reduce((s, b) => s + b.nextDay.den, 0);
    const baseline = high.reduce((s, b) => s + b.nextDay.num, 0) / Math.max(1, treatedN);
    out.ad_frequency = {
      intervention: `일일 광고 노출 상한을 전체에 동일하게 겁니다. 상한 아래로 보던 유저는 아무 변화가 없습니다`,
      treated: { label: `상한에 걸리던 고빈도 구간 (${high.map((b) => b.label).join(", ")})`, users: treatedN },
      control: { label: `상한 아래 구간 (${lowB.map((b) => b.label).join(", ")})`, users: controlN },
      outcome: `당일 광고 시청 후 익일 접속률 (현재 고빈도 구간 ${pct(baseline)})`,
      daysPerPeriod: clampDays(perCellFor(baseline, 5) / Math.max(dailyFlow(treatedN, days), 1)),
      mdePp: mdePp(baseline, Math.min(treatedN, controlN)),
      precheck: `고빈도 구간의 표본이 ${num(treatedN)}건이라 변경 전 기간을 충분히 길게 잡아야 함`,
      feasible: true,
      confounders: `광고 재고(fill rate) 변동이 두 집단에 다르게 들어올 수 있으므로 네트워크별 응답률을 함께 기록`,
      note: `광고 매출이 함께 움직이므로 가드레일로 광고 매출과 ARPDAU를 같이 본다`,
    };
  }

  // 채널: 예산을 옮기고 나머지 채널을 비교군으로 둔다
  const chans = m.segments.channel.filter((c) => c.d7.den > 0);
  if (chans.length >= 2) {
    const worst = chans.reduce((a, b) => (b.d7.rate < a.d7.rate ? b : a));
    const rest = chans.filter((c) => c.key !== worst.key);
    const controlUsers = rest.reduce((s, c) => s + c.users, 0);
    const baseline = worst.d7.rate;
    out.channel_quality = {
      intervention: `${worst.key} 캠페인 구성만 바꾸고 나머지 채널 집행은 유지합니다. 유저에게 가는 것은 광고 소재뿐입니다`,
      treated: { label: `${worst.key} 유입 유저`, users: worst.users },
      control: { label: "나머지 채널 유입 유저", users: controlUsers },
      outcome: `D7 잔존율 (현재 ${worst.key} ${pct(baseline)})`,
      daysPerPeriod: clampDays(perCellFor(baseline, 3) / Math.max(dailyFlow(worst.users, days), 1)),
      mdePp: mdePp(baseline, Math.min(worst.users, controlUsers)),
      precheck: `변경 전 두 집단의 D7 격차가 일정했는지 확인 필요. 채널 정의(utm 기준)를 중간에 바꾸지 않아야 함`,
      feasible: true,
      confounders: `채널 안에서 캠페인 구성이 바뀌면 유입 믹스가 달라지므로 캠페인 단위로 쪼개 확인`,
    };
  }

  // 기간이 상한에 닿거나 검출 가능한 최소 효과가 너무 크면 "확인 불가"로 표시하고 대안을 준다
  for (const [id, d] of Object.entries(out)) {
    d.feasible = d.daysPerPeriod < MAX_DAYS && d.mdePp <= MAX_MDE_PP;
    if (!d.feasible) d.fallback = FALLBACK[id] ?? "표본이 쌓일 때까지 변경을 미루거나, 더 큰 폭으로 바꿔 큰 효과를 노린 뒤 확인";
  }
  return out;
}

/** 통계적으로 확인이 어려울 때 대신 할 것. 숫자로 증명하지 못한다는 사실을 숨기지 않는다 */
const FALLBACK: Record<string, string> = {
  level_wall: "인접 레벨을 넓혀 비교군을 키우거나, 지표를 미진입률에서 해당 구간 통과까지 걸린 시도 수로 바꾸면 같은 인원으로도 차이가 더 빨리 드러남",
  device_perf: "D1 대신 평균 세션 길이와 크래시율처럼 유저당 여러 번 측정되는 지표로 보면 같은 인원으로도 확인 가능. 잔존은 그 뒤에 따라오는지 확인",
  ad_frequency: "고빈도 구간 자체가 작아 잔존율로는 확인 불가. 상한을 걸고 광고 매출과 ARPDAU가 유지되는지만 가드레일로 보고, 잔존 판단은 표본이 쌓인 뒤로 미룰 것",
  channel_quality: "잔존율 대신 D7까지 남은 유저당 획득 비용으로 비교하면 표본 없이도 예산 판단 가능. 이 계산에는 채널별 설치 단가가 필요",
};
