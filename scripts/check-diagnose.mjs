// 진단 엔진을 샘플 데이터로 돌려 정답지(02-sample-data-spec.md)의 시그널에 도달하는지 확인한다.
// 실행: node scripts/check-diagnose.mjs [데이터 폴더]   (Node 22.18+ 타입 스트리핑 사용)
// 하나라도 실패하면 exit 1. "이 함정을 통과하지 못하는 엔진은 출시하지 않는다."
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, diagnose } from "../lib/diagnose/engine.ts";
import { buildReport } from "../lib/diagnose/findings.ts";

const dir = process.argv[2] ?? join(import.meta.dirname, "../../data");
const read = (f) => parseCsv(readFileSync(join(dir, f), "utf8"));

const t0 = performance.now();
const tables = {
  users: read("users.csv"),
  sessions: read("sessions.csv"),
  attempts: read("level_attempts.csv"),
  purchases: read("purchases.csv"),
  ads: read("ad_views.csv"),
};
const t1 = performance.now();
const m = diagnose(tables);
const t2 = performance.now();

const pct = (r) => +(r.rate * 100).toFixed(1);
let failed = 0;
const check = (name, ok, got) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  →  ${got}`);
  if (!ok) failed++;
};

console.log(`파싱 ${(t1 - t0).toFixed(0)}ms, 계산 ${(t2 - t1).toFixed(0)}ms, 결과 JSON ${(JSON.stringify(m).length / 1024).toFixed(1)}KB\n`);

// 기준 지표 (표준 라이브러리 Python 독립 구현과 일치해야 함)
const ret = Object.fromEntries(m.retention.map((x) => [x.day, x.r]));
check("D1 classic = 2414/6000", ret[1].num === 2414 && ret[1].den === 6000, `${ret[1].num}/${ret[1].den} ${pct(ret[1])}%`);
check("D7 classic = 816/6000", ret[7].num === 816 && ret[7].den === 6000, `${ret[7].num}/${ret[7].den}`);
check("D14 분모는 14일 관측된 유저만 (4185)", ret[14].den === 4185 && ret[14].num === 344, `${ret[14].num}/${ret[14].den} ${pct(ret[14])}%`);
check("결제 전환율 4.48%", m.monetization.payers.num === 269, `${m.monetization.payers.num}명 ${(m.monetization.payers.rate * 100).toFixed(2)}%`);
check("ARPPU 약 10,528원", Math.round(m.monetization.arppuKrw) === 10528, `${Math.round(m.monetization.arppuKrw)}원`);

// 시그널 1: 레벨 12 난이도 벽
const L = Object.fromEntries(m.levels.map((l) => [l.level, l]));
check("시그널1 L11 시도 대비 클리어율 62.0%", pct(L[11].attemptClear) === 62.0, `${pct(L[11].attemptClear)}%`);
check("시그널1 L12 시도 대비 클리어율 28.3%", pct(L[12].attemptClear) === 28.3, `${pct(L[12].attemptClear)}%`);
check("시그널1 L12 도달자 2267, 정체 15.0%", L[12].reached === 2267 && pct(L[12].stuck) === 15.0, `${L[12].reached}명 ${pct(L[12].stuck)}%`);
const topStuck = [...m.levels].filter((l) => l.reached >= 100).sort((a, b) => b.stuck.rate - a.stuck.rate)[0];
check("시그널1 최대 정체 레벨 = 12", topStuck.level === 12, `L${topStuck.level}`);
// 두 클리어율의 격차는 레벨이 오를수록 자연히 벌어진다. 재도전 구간은 절대 격차가 아니라 직전 레벨 대비 급증으로 찾는다.
const gap = (l) => l.reachClear.rate - l.attemptClear.rate;
const jumps = m.levels.filter((l) => l.reached >= 100 && L[l.level - 1]).map((l) => ({ level: l.level, jump: gap(l) - gap(L[l.level - 1]) }));
const topJump = jumps.sort((a, b) => b.jump - a.jump)[0];
check("시그널1 시도·도달 클리어율 격차의 직전 대비 급증이 L12에서 최대 (재도전 구간)", topJump.level === 12,
  `L${topJump.level} +${(topJump.jump * 100).toFixed(1)}%p, 2위 +${(jumps[1].jump * 100).toFixed(1)}%p`);

// 시그널 2: 저사양 기기
const tier = Object.fromEntries(m.segments.deviceTier.map((s) => [s.key, s]));
check("시그널2 low 세션 4.5분 / high 9.5분", tier.low.avgSessionMin.toFixed(1) === "4.5" && tier.high.avgSessionMin.toFixed(1) === "9.5",
  `low ${tier.low.avgSessionMin.toFixed(2)} / high ${tier.high.avgSessionMin.toFixed(2)}`);
check("시그널2 low D1 < high D1", tier.low.d1.rate < tier.high.d1.rate, `low ${pct(tier.low.d1)}% / high ${pct(tier.high.d1)}%`);
const andLow = m.segments.tierShareWithinPlatform.find((x) => x.platform === "android" && x.tier === "low");
check("시그널2 Android 중 low 비중 약 42%", Math.abs(andLow.share - 0.42) < 0.03, `${(andLow.share * 100).toFixed(1)}%`);

// 시그널 3: 생존 편향 트랩
const naive = m.ads.naiveCumulativeD7;
check("시그널3 [틀린 집계] 누적 31회 이상 D7 = 100% 재현", pct(naive[3].d7) === 100, naive.map((b) => `${b.label} ${pct(b.d7)}%`).join(", "));
const fb = m.ads.fixedDay.buckets;
const expect = [[2969, 67.4], [851, 77.4], [190, 75.3], [39, 66.7]];
check("시그널3 [올바른 집계] 표본·익일 잔존이 정답지 표와 일치",
  fb.every((b, i) => b.nextDay.den === expect[i][0] && pct(b.nextDay) === expect[i][1]),
  fb.map((b) => `${b.label} ${pct(b.nextDay)}% (n=${b.nextDay.den})`).join(", "));
const peak = fb.reduce((a, b) => (b.nextDay.rate > a.nextDay.rate ? b : a));
check("시그널3 정점은 3-4회", peak.label === "3-4회", peak.label);
check("시그널3 7회 이상은 표본 부족 플래그", fb[3].lowSample && !fb[0].lowSample && !fb[1].lowSample, `lowSample=${fb.map((b) => b.lowSample)}`);

// 시그널 4: 채널
const ch = Object.fromEntries(m.segments.channel.map((s) => [s.key, s]));
const worstD7 = [...m.segments.channel].sort((a, b) => a.d7.rate - b.d7.rate)[0];
check("시그널4 D7 최저 채널 = tiktok_ads, D7 8.1%", worstD7.key === "tiktok_ads" && pct(ch.tiktok_ads.d7) === 8.1, `${worstD7.key} ${pct(worstD7.d7)}%`);
check("시그널4 tiktok 설치 비중 약 18%", Math.abs(ch.tiktok_ads.share - 0.18) < 0.01, `${(ch.tiktok_ads.share * 100).toFixed(1)}%`);

// 시그널 5: 좌절 → 결제
const fpl = m.monetization.firstPurchaseLevel[0];
check("시그널5 첫 결제 최다 레벨 = 12 (22건)", fpl.level === 12 && fpl.count === 22, `L${fpl.level} ${fpl.count}건`);
const bs = m.monetization.buyAfterFailStreak;
check("시그널5 연속 실패가 쌓일수록 결제 비율 상승 (1회 < 3회 < 5회+)", bs[0].r.rate < bs[2].r.rate && bs[2].r.rate < bs[4].r.rate,
  bs.map((b) => `${b.streak}${b.streak === 5 ? "+" : ""}회 ${(b.r.rate * 100).toFixed(2)}%`).join(", "));
check("시그널1×5 충돌: 최대 정체 레벨 = 첫 결제 최다 레벨", topStuck.level === fpl.level, `L${topStuck.level} = L${fpl.level}`);

// 리포트 해석 규칙이 정답지의 결론에 도달하는가
const rep = buildReport(m);
check("리포트 1순위 = 레벨 벽, 2순위 = 저사양, 3순위 = 채널", rep.findings.map((f) => f.id).join(",") === "level_wall,device_perf,channel_quality", rep.findings.map((f) => f.id).join(","));
check("리포트 벽 = L12, 매출 충돌 인지", rep.wall?.level.level === 12 && rep.wall.conflict, `L${rep.wall?.level.level} conflict=${rep.wall?.conflict}`);
check("리포트 목표 클리어율이 정답지 권고(45-50%) 안", rep.wall.targetClearPct >= 45 && rep.wall.targetClearPct <= 50, `${rep.wall.targetClearPct}%`);
check("리포트 1순위 개선안에 1,200원 오퍼", rep.findings[0].body.includes("1,200원"), rep.findings[0].title);
check("리포트 광고: 정점 3-4회, 이후 하락, 마지막 구간 표본 부족 단서", rep.ads.peakLabel === "3-4회" && rep.ads.declinesAfterPeak && rep.ads.last.lowSample && rep.ads.last.n === 39, JSON.stringify(rep.ads));
check("리포트 연속 실패 → 결제 상승 인지", rep.streakRises, String(rep.streakRises));

// 개인정보: 결과에 user_id가 섞여 나가면 안 된다
check("결과 JSON에 user_id 없음", !/u\d{6}/.test(JSON.stringify(m)), "OK");

console.log(failed ? `\n${failed}개 실패` : "\n전부 통과");
process.exit(failed ? 1 : 0);
