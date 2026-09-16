// 계산된 지표에서 "먼저 고칠 것" 후보를 규칙으로 뽑는다.
// 숫자는 전부 DiagnosisMetrics에서 가져온다. 문장에 숫자를 손으로 적지 않는다.
// 문체는 prompts/voice.md를 따른다. 요약과 개선안 본문은 서술형, 근거와 실행 방법은 명사형 개조식.
// LLM 해석이 붙기 전의 기본 해석이자, LLM이 실패해도 리포트가 서게 하는 바닥이다.

import type { DiagnosisMetrics, LevelStat, SegmentStat } from "./engine.ts";
import { buildDesigns, type Design } from "./experiment.ts";

export type Evidence = { label: string; text: string };
export type Option = { label: string; detail: string };

export type Finding = {
  id: "level_wall" | "device_perf" | "channel_quality" | "ad_frequency";
  title: string;
  body: string;
  tag?: string;
  evidence: Evidence[];
  options?: Option[];
  preference?: string;
  /** 유저를 나누지 않고 효과를 확인하는 방법 */
  design?: Design;
  /** 정렬용 영향 유저 추정치 */
  impactUsers: number;
};

export type AdReading = {
  peakLabel: string;
  peakRate: number;
  firstRate: number;
  last: { label: string; rate: number; n: number; lowSample: boolean };
  declinesAfterPeak: boolean;
};

export type Report = {
  summary: string;
  findings: Finding[];
  wall: WallReading | null;
  ads: AdReading | null;
  streakRises: boolean;
};

export type WallReading = {
  level: LevelStat;
  prev: LevelStat;
  targetClearPct: number;
  firstBuyCount: number;
  firstBuyRank: number;
  conflict: boolean;
};

const MIN_REACH_SHARE = 0.02;
const MIN_SEGMENT_USERS = 100;

export const pct = (r: number, digits = 1) => `${(r * 100).toFixed(digits)}%`;
export const num = (n: number) => Math.round(n).toLocaleString("ko-KR");
export const won = (n: number) => `${num(n)}원`;
/** 비율의 차이는 %가 아니라 %p로 쓴다. 화면에 보이는 값끼리의 차이와 어긋나지 않게 반올림 후 뺀다 */
export const pp = (a: number, b: number, digits = 1) => {
  const r = (x: number) => Number((x * 100).toFixed(digits));
  return `${Math.abs(r(a) - r(b)).toFixed(digits)}%p`;
};

/** 받침이 있으면 "으로", 없으면 "로". 숫자는 읽는 소리 기준(1, 3, 6, 7, 8, 0은 받침 있음) */
function ro(word: string): string {
  const c = word.trim().slice(-1);
  // 숫자는 읽는 소리의 받침을 본다. 0(영) 3(삼) 6(육)만 "으로", 1·7·8은 ㄹ 받침이라 "로"
  if (/[0-9]/.test(c)) return "036".includes(c) ? "으로" : "로";
  const code = c.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11172) return "로";
  const batchim = code % 28;
  return batchim === 0 || batchim === 8 ? "로" : "으로";
}

/** 받침에 따른 은/는. "레벨 12은"을 막는다 */
function eun(word: string): string {
  const c = word.trim().slice(-1);
  if (/[0-9]/.test(c)) return "013678".includes(c) ? "은" : "는";
  const code = c.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11172) return "는";
  return code % 28 === 0 ? "는" : "은";
}

/** "고사양 9.5분, 중사양 8.0분, 저사양 4.5분으로 고사양 > 중사양 > 저사양 순" */
function ranked<T>(items: T[], name: (x: T) => string, value: (x: T) => number, fmt: (x: T) => string): string {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const list = sorted.map((x) => `${name(x)} ${fmt(x)}`).join(", ");
  return `${list}${ro(list)} ${sorted.map(name).join(" > ")} 순`;
}

function readWall(m: DiagnosisMetrics): WallReading | null {
  const minReach = Math.max(MIN_SEGMENT_USERS, m.meta.users * MIN_REACH_SHARE);
  const byLevel = new Map(m.levels.map((l) => [l.level, l]));
  let best: { level: LevelStat; prev: LevelStat; drop: number } | null = null;
  for (const l of m.levels) {
    const prev = byLevel.get(l.level - 1);
    if (!prev || l.reached < minReach) continue;
    const drop = prev.attemptClear.rate - l.attemptClear.rate;
    if (!best || drop > best.drop) best = { level: l, prev, drop };
  }
  if (!best || best.drop < 0.15) return null;

  // 목표 클리어율: 지금 값과 앞뒤 레벨 평균의 중간. 벽을 없애지 않고 낮춘다.
  const next = byLevel.get(best.level.level + 1);
  const neighbor = next ? (best.prev.attemptClear.rate + next.attemptClear.rate) / 2 : best.prev.attemptClear.rate;
  const target = Math.round(((best.level.attemptClear.rate + neighbor) / 2) * 20) * 5;

  const fp = m.monetization.firstPurchaseLevel;
  const idx = fp.findIndex((x) => x.level === best.level.level);
  return {
    level: best.level,
    prev: best.prev,
    targetClearPct: target,
    firstBuyCount: idx >= 0 ? fp[idx].count : 0,
    firstBuyRank: idx + 1,
    conflict: idx === 0,
  };
}

function wallFinding(m: DiagnosisMetrics, w: WallReading, streakRises: boolean): Finding {
  const L = w.level.level;
  const cheapest = [...m.monetization.byProduct].sort((a, b) => a.priceKrw - b.priceKrw)[0];
  const offer = cheapest ? `${cheapest.productId}(${won(cheapest.priceKrw)})` : "저가";
  const streak = m.monetization.buyAfterFailStreak;
  const first = streak[0];
  const last = streak[streak.length - 1];
  const streakText = streakRises && first && last
    ? ` 연속 실패 ${first.streak}회 ${pct(first.r.rate, 2)}, ${last.streak}회 이상 ${pct(last.r.rate, 2)}로 실패가 쌓일수록 결제율 상승`
    : "";

  return {
    id: "level_wall",
    title: w.conflict ? `레벨 ${L}${eun(String(L))} 난이도를 낮추되 직전에 저가 오퍼를 두는 편이 좋아 보입니다` : `레벨 ${L}의 난이도 조정이 필요해 보입니다`,
    tag: w.conflict ? "매출 영향 있음" : undefined,
    body: w.conflict
      ? `시도 대비 클리어율을 ${w.targetClearPct}% 안팎으로 올리는 정도면 충분합니다. 벽을 완전히 없애지 않는 이유는 이 레벨의 좌절이 첫 결제를 가장 많이 만들고 있기 때문입니다. 대신 벽 직전에 ${offer} 오퍼를 두어 이탈로 갈 유저의 일부를 결제로 돌리는 편이 나아 보입니다.`
      : `시도 대비 클리어율을 ${w.targetClearPct}% 안팎으로 올리는 정도가 적절해 보입니다. 직전 레벨보다 급격히 어려워진 지점이라 도달자의 상당수가 다음 레벨로 넘어가지 못하고 있습니다.`,
    evidence: [
      { label: "근거", text: `레벨 ${L} 시도 대비 클리어율 ${pct(w.level.attemptClear.rate)} 기록, 직전 레벨인 L${w.prev.level}(${pct(w.prev.attemptClear.rate)}) 대비 ${pp(w.level.attemptClear.rate, w.prev.attemptClear.rate)} 감소로 전 구간 최대 낙폭` },
      { label: "이탈", text: `레벨 ${L} 도달 ${num(w.level.reached)}명 중 ${num(w.level.stuck.num)}명(${pct(w.level.stuck.rate)})이 다음 레벨 미진입` },
      w.conflict
        ? { label: "상충 지점", text: `첫 결제 발생 단일 레벨 1위(${num(w.firstBuyCount)}건) 차지.${streakText}` }
        : m.meta.purchases === 0
          ? { label: "한계", text: `결제 데이터 미포함으로 난이도 조정의 매출 영향 확인 불가. 조정 전 결제 로그 확보 필요` }
          : { label: "결제", text: w.firstBuyCount ? `첫 결제 ${num(w.firstBuyCount)}건으로 레벨 중 ${w.firstBuyRank}위 기록` : `이 레벨의 첫 결제 발생 없음` },
      { label: "가드레일", text: `난이도를 낮추면 결제가 함께 줄 수 있으므로 설치당 매출과 첫 결제 발생 레벨 분포를 같이 확인 필요` },
    ],
    options: [
      { label: `1안 - 목표 이동 수를 늘려 클리어율을 ${w.targetClearPct}% 안팎으로 조정`, detail: `레벨 ${L} 단독 조정 후 L${w.prev.level}, L${L + 1}과의 낙폭 재확인` },
      { label: `2안 - 연속 2회 실패 시 부스터 1회 지급`, detail: `난이도 자체는 유지하면서 통과율만 올리는 방식` },
    ],
    preference: `1안을 먼저 권하나, 밸런싱 리스크가 크다면 2안이 대안으로 적절하다고 생각됩니다`,
    impactUsers: w.level.stuck.num,
  };
}

function deviceFinding(m: DiagnosisMetrics): Finding | null {
  const tiers = new Map(m.segments.deviceTier.map((s) => [s.key, s]));
  const low = tiers.get("low");
  const high = tiers.get("high");
  if (!low || !high || low.users < MIN_SEGMENT_USERS || high.users < MIN_SEGMENT_USERS) return null;
  if (low.avgSessionMin == null || high.avgSessionMin == null) return null;
  const ratio = low.avgSessionMin / high.avgSessionMin;
  const gap = high.d1.rate - low.d1.rate;
  if (ratio > 0.7 || gap < 0.05) return null;

  const label: Record<string, string> = { high: "고사양", mid: "중사양", low: "저사양" };
  const name = (t: SegmentStat) => label[t.key] ?? t.key;
  const withSession = m.segments.deviceTier.filter((t) => t.avgSessionMin != null);
  const andLow = m.segments.tierShareWithinPlatform.find((x) => x.platform === "android" && x.tier === "low");

  return {
    id: "device_perf",
    title: "저사양 기기의 성능 점검이 필요해 보입니다",
    body: `같은 콘텐츠인데 저사양 기기의 체류 시간이 고사양의 절반에 못 미칩니다. 재미보다 성능 요인을 먼저 의심해 볼 만한 격차입니다. 저사양이 전체 설치에서 차지하는 비중이 작지 않아, 그대로 두면 전체 리텐션을 계속 끌어내릴 것으로 보입니다.`,
    evidence: [
      { label: "근거", text: `평균 세션 길이는 ${ranked(withSession, name, (t) => t.avgSessionMin!, (t) => `${t.avgSessionMin!.toFixed(1)}분`)}` },
      { label: "같은 방향", text: `D1 잔존율도 ${ranked(withSession, name, (t) => t.d1.rate, (t) => pct(t.d1.rate))}. 저사양은 고사양 대비 ${pp(high.d1.rate, low.d1.rate)} 감소` },
      { label: "규모", text: `저사양 구간이 전체 설치의 ${pct(low.share)} 차지${andLow ? `, Android 설치 중에서는 ${pct(andLow.share)} 차지` : ""}` },
      { label: "한계", text: `이 데이터만으로 성능 요인 확정 불가. 기기 등급별 프레임 드랍, 로딩 시간, 크래시율 확인 필요` },
    ],
    impactUsers: low.users * gap,
  };
}

function channelFinding(m: DiagnosisMetrics): Finding | null {
  const overall = m.retention.find((x) => x.day === 7)?.r.rate;
  const chans = m.segments.channel.filter((s) => s.users >= MIN_SEGMENT_USERS && s.d7.den >= MIN_SEGMENT_USERS);
  if (overall == null || chans.length < 2) return null;
  const worst = chans.reduce((a, b) => (b.d7.rate < a.d7.rate ? b : a));
  const best = chans.reduce((a, b) => (b.d7.rate > a.d7.rate ? b : a));
  if (worst.d7.rate > overall * 0.75) return null;
  const organic = chans.find((s) => s.key === "organic");
  const ref: SegmentStat = organic && organic !== worst ? organic : best;

  return {
    id: "channel_quality",
    title: `${worst.key} 채널을 D7 기준으로 다시 계산해 볼 필요가 있습니다`,
    body: `설치 단가가 낮아도 D7까지 남는 유저를 기준으로 환산하면 실제 획득 비용은 더 비쌀 수 있습니다. 채널을 끊는 판단보다, 같은 예산으로 남는 유저를 몇 명 얻고 있는지를 먼저 계산해 보시길 권합니다.`,
    evidence: [
      { label: "근거", text: `D7 잔존율은 ${ranked(chans, (c) => c.key, (c) => c.d7.rate, (c) => pct(c.d7.rate))}` },
      { label: "격차", text: `${worst.key} D7 ${pct(worst.d7.rate)} 기록, ${ref.key}(${pct(ref.d7.rate)}) 대비 ${pp(ref.d7.rate, worst.d7.rate)} 감소. 전체 평균(${pct(overall)}) 대비로도 ${pp(overall, worst.d7.rate)} 낮음` },
      { label: "규모", text: `${worst.key}가 전체 설치의 ${pct(worst.share)} 차지` },
      { label: "필요한 데이터", text: `채널별 설치 단가(CPI) 없이는 예산 재배분 판단 불가. 소재·타겟 요인 가능성이 있어 캠페인 단위 분리 확인 필요` },
    ],
    impactUsers: worst.users * Math.max(0, overall - worst.d7.rate),
  };
}

function readAds(m: DiagnosisMetrics): AdReading | null {
  const b = m.ads.fixedDay.buckets.filter((x) => x.nextDay.den > 0);
  if (b.length < 3) return null;
  const peak = b.reduce((a, x) => (x.nextDay.rate > a.nextDay.rate ? x : a));
  const last = b[b.length - 1];
  return {
    peakLabel: peak.label,
    peakRate: peak.nextDay.rate,
    firstRate: b[0].nextDay.rate,
    last: { label: last.label, rate: last.nextDay.rate, n: last.nextDay.den, lowSample: last.lowSample },
    declinesAfterPeak: peak !== last && last.nextDay.rate < peak.nextDay.rate,
  };
}

/** 생존 편향 4단 논증. voice.md의 논증 형식을 그대로 따른다. */
function adFinding(m: DiagnosisMetrics, a: AdReading): Finding | null {
  const naive = m.ads.naiveCumulativeD7;
  const naiveTop = naive[naive.length - 1];
  const buckets = m.ads.fixedDay.buckets.filter((b) => b.nextDay.den > 0);
  if (!naiveTop || buckets.length < 3) return null;

  return {
    id: "ad_frequency",
    title: `광고 빈도는 하루 ${a.peakLabel} 구간을 기준선으로 잡으세요`,
    body: `누적 시청량으로 보면 광고를 많이 볼수록 잔존이 높아 보이지만, 오래 남은 유저가 광고를 더 많이 본 결과입니다. 경과일을 고정해 다시 집계하면 방향이 달라집니다. 다만 상한을 당장 내리기보다 표본을 더 쌓은 뒤 판단하시길 권합니다.`,
    evidence: [
      { label: "관찰", text: `데이터 확인 결과, 누적 광고 시청량이 많은 유저일수록 D7 잔존율이 높음(${naiveTop.label} 구간 ${pct(naiveTop.d7.rate)})` },
      { label: "교란 요인", text: `하지만 오래 잔존한 유저일수록 시청 누적량이 커지는 구조로, 생존 편향이 포함됨. 누적량은 잔존 기간의 결과이므로 경과일 고정 후 재집계가 필요` },
      { label: "분리 결과", text: `경과 ${m.ads.fixedDay.dayFrom}-${m.ads.fixedDay.dayTo}일 고정 시 당일 ${ranked(buckets, (b) => b.label, (b) => b.nextDay.rate, (b) => pct(b.nextDay.rate))}` },
      a.last.lowSample
        ? { label: "단서", text: `단 ${a.last.label} 구간은 n이 ${num(a.last.n)}로 결론을 내리기에 부족. 상한 조정 전 표본 축적 필요` }
        : { label: "가드레일", text: `상한을 내리면 광고 매출이 함께 줄 수 있으므로 ARPDAU와 광고 매출을 같이 확인 필요` },
    ],
    // 정점과 마지막 구간의 격차가 걸린 유저-일 수
    impactUsers: buckets.reduce((s, b) => s + b.nextDay.den, 0) * Math.max(0, a.peakRate - a.last.rate) * 0.5,
  };
}

export function buildReport(m: DiagnosisMetrics): Report {
  const wall = readWall(m);
  const ads = readAds(m);
  const s = m.monetization.buyAfterFailStreak;
  const streakRises = s.length >= 3 && s[0].r.rate < s[Math.floor(s.length / 2)].r.rate && s[Math.floor(s.length / 2)].r.rate < s[s.length - 1].r.rate;

  const designs = buildDesigns(m, wall?.level.level ?? null);
  const findings = [
    wall && wallFinding(m, wall, streakRises),
    deviceFinding(m),
    channelFinding(m),
    ads && adFinding(m, ads),
  ]
    .filter((f): f is Finding => !!f)
    .map((f) => ({ ...f, design: designs[f.id] }))
    .sort((a, b) => b.impactUsers - a.impactUsers);

  let summary: string;
  if (wall) {
    const L = wall.level.level;
    summary =
      `이 게임의 이탈은 리텐션 곡선 전반이 아니라 레벨 ${L} 한 지점에 몰려 있습니다. ` +
      `시도 대비 클리어율은 ${pct(wall.level.attemptClear.rate)}로 직전 레벨 L${wall.prev.level}(${pct(wall.prev.attemptClear.rate)}) 대비 ${pp(wall.level.attemptClear.rate, wall.prev.attemptClear.rate)} 낮고, 도달한 ${num(wall.level.reached)}명 가운데 ${num(wall.level.stuck.num)}명(${pct(wall.level.stuck.rate)})이 다음 레벨로 넘어가지 못했습니다. ` +
      (wall.conflict
        ? `다만 같은 레벨이 첫 결제가 가장 많이 발생한 단일 레벨이어서, 난이도만 낮추면 매출이 함께 빠질 수 있습니다.`
        : `여기를 먼저 고치는 것이 가장 많은 유저를 붙잡는 방법입니다.`);
  } else if (findings.length) {
    summary = `뚜렷한 난이도 벽은 보이지 않습니다. 영향 유저 수 기준으로 가장 큰 문제는 "${findings[0].title}"입니다. 아래 분석 내용을 함께 확인해 보시면 좋겠습니다.`;
  } else {
    summary = `규칙으로 잡히는 뚜렷한 이상 신호는 없습니다. 아래 계산 결과를 직접 확인해 보시면 좋겠습니다.`;
  }

  return { summary, findings, wall, ads, streakRises };
}
