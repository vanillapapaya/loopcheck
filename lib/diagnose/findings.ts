// 계산된 지표에서 "먼저 고칠 것" 후보를 규칙으로 뽑는다.
// 숫자는 전부 DiagnosisMetrics에서 가져온다. 문장에 숫자를 손으로 적지 않는다.
// LLM 해석이 붙기 전의 기본 해석이자, LLM이 실패해도 리포트가 서게 하는 바닥이다.

import type { DiagnosisMetrics, LevelStat, SegmentStat } from "./engine";

export type Evidence = { label: string; text: string };

export type Finding = {
  id: "level_wall" | "device_perf" | "channel_quality";
  title: string;
  body: string;
  tag?: string;
  evidence: Evidence[];
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
const pp = (a: number, b: number) => `${((a - b) * 100).toFixed(1)}%p`;

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

function wallFinding(m: DiagnosisMetrics, w: WallReading): Finding {
  const L = w.level.level;
  const cheapest = [...m.monetization.byProduct].sort((a, b) => a.priceKrw - b.priceKrw)[0];
  const offer = cheapest ? `${won(cheapest.priceKrw)}짜리 ${cheapest.productId}` : "저가";
  return {
    id: "level_wall",
    title: w.conflict ? `레벨 ${L}의 난이도를 낮추되, 직전에 저가 오퍼를 놓으세요` : `레벨 ${L}의 난이도를 낮추세요`,
    tag: w.conflict ? "매출 영향 있음" : undefined,
    body: w.conflict
      ? `시도 대비 클리어율을 ${w.targetClearPct}% 안팎으로 올리는 정도면 충분합니다. 벽을 완전히 없애지 않는 이유는 이 레벨의 좌절이 첫 결제를 가장 많이 만들고 있기 때문입니다. 대신 벽 직전에 ${offer} 오퍼를 배치해, 이탈로 갈 유저의 일부를 결제로 돌리세요.`
      : `시도 대비 클리어율을 ${w.targetClearPct}% 안팎으로 올리세요. 직전 레벨보다 급격히 어려워진 지점이라 도달자 중 ${pct(w.level.stuck.rate)}가 다음 레벨로 넘어가지 못했습니다.`,
    evidence: [
      { label: "근거", text: `L${w.prev.level} ${pct(w.prev.attemptClear.rate)} → L${L} ${pct(w.level.attemptClear.rate)}, 도달자 ${num(w.level.reached)}명 중 ${num(w.level.stuck.num)}명 정체` },
      w.conflict
        ? { label: "상충 지점", text: `첫 결제 발생 레벨 1위, ${num(w.firstBuyCount)}건` }
        : { label: "결제", text: w.firstBuyCount ? `첫 결제 ${num(w.firstBuyCount)}건 (레벨 중 ${w.firstBuyRank}위)` : "이 레벨의 첫 결제 기록 없음" },
      { label: "검증 방법", text: `이동 수 조정 A/B. 1차 지표 D3 리텐션, 가드레일 설치당 매출` },
    ],
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
  const andLow = m.segments.tierShareWithinPlatform.find((x) => x.platform === "android" && x.tier === "low");
  return {
    id: "device_perf",
    title: "저사양 기기의 성능을 점검하세요",
    body: `저사양 기기 유저의 평균 세션이 ${low.avgSessionMin.toFixed(1)}분으로, 고사양 ${high.avgSessionMin.toFixed(1)}분의 ${Math.round(ratio * 100)}% 수준입니다. 같은 콘텐츠인데 체류가 이만큼 짧으면 재미보다 성능 문제를 먼저 의심해야 합니다. 저사양이 전체 설치의 ${pct(low.share)}${andLow ? `, Android 설치 중에서는 ${pct(andLow.share)}` : ""}라 방치하면 전체 리텐션을 계속 끌어내립니다.`,
    evidence: [
      { label: "근거", text: `세션 ${low.avgSessionMin.toFixed(1)}분 vs ${high.avgSessionMin.toFixed(1)}분, D1 ${pct(low.d1.rate)} vs ${pct(high.d1.rate)}` },
      { label: "먼저 확인할 것", text: "프레임 드랍, 로딩 시간, 크래시율의 기기 등급별 분포" },
      { label: "한계", text: "이 데이터만으로는 성능 문제를 확정할 수 없습니다. 크래시·성능 로그가 필요합니다" },
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
    title: `${worst.key} 채널을 D7 기준으로 다시 계산하세요`,
    body: `전체 설치의 ${pct(worst.share)}를 차지하는데 D7이 ${pct(worst.d7.rate)}로 ${ref.key}(${pct(ref.d7.rate)})보다 ${pp(ref.d7.rate, worst.d7.rate)} 낮습니다. 설치 단가가 싸도 D7까지 남는 유저 기준으로 환산하면 실제 획득 비용은 더 비쌀 수 있습니다.`,
    evidence: [
      { label: "근거", text: `D1 ${pct(worst.d1.rate)} / D7 ${pct(worst.d7.rate)}, 채널 중 최저 (전체 D7 ${pct(overall)})` },
      { label: "필요한 데이터", text: "채널별 설치 단가(CPI). 이것 없이는 예산 재배분을 판단할 수 없습니다" },
      { label: "주의", text: "소재나 타겟 문제일 수 있어, 채널을 끊기 전에 캠페인 단위로 쪼개 보세요" },
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

export function buildReport(m: DiagnosisMetrics): Report {
  const wall = readWall(m);
  const findings = [wall && wallFinding(m, wall), deviceFinding(m), channelFinding(m)]
    .filter((f): f is Finding => !!f)
    .sort((a, b) => b.impactUsers - a.impactUsers);

  const s = m.monetization.buyAfterFailStreak;
  const streakRises = s.length >= 3 && s[0].r.rate < s[Math.floor(s.length / 2)].r.rate && s[Math.floor(s.length / 2)].r.rate < s[s.length - 1].r.rate;

  let summary: string;
  if (wall) {
    const L = wall.level.level;
    summary =
      `이 게임의 가장 큰 문제는 레벨 ${L} 한 지점에 있습니다. ` +
      `시도 대비 클리어율이 직전 레벨 ${pct(wall.prev.attemptClear.rate)}에서 ${pct(wall.level.attemptClear.rate)}로 떨어지고, ` +
      `이 레벨에 도달한 ${num(wall.level.reached)}명 가운데 ${num(wall.level.stuck.num)}명이 다음 레벨로 넘어가지 못했습니다. ` +
      (wall.conflict
        ? `그런데 같은 레벨이 첫 결제가 가장 많이 일어나는 지점이기도 합니다. 벽을 그냥 없애면 매출이 빠지고, 두면 유저가 빠집니다. 이 충돌을 어떻게 다룰지가 이번 진단의 핵심입니다.`
        : `여기를 먼저 고치는 것이 가장 많은 유저를 붙잡는 방법입니다.`);
  } else if (findings.length) {
    summary = `뚜렷한 난이도 벽은 보이지 않습니다. 영향 유저 기준으로 가장 큰 문제는 "${findings[0].title}"입니다.`;
  } else {
    summary = "규칙으로 잡히는 뚜렷한 이상 신호가 없습니다. 아래 숫자를 직접 확인해 주세요.";
  }

  return { summary, findings, wall, ads: readAds(m), streakRises };
}
