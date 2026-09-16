// 진단 엔진을 샘플 데이터로 돌려 정답지(02-sample-data-spec.md)의 시그널에 도달하는지 확인한다.
// 실행: node scripts/check-diagnose.mjs [데이터 폴더]   (Node 22.18+ 타입 스트리핑 사용)
// 하나라도 실패하면 exit 1. "이 함정을 통과하지 못하는 엔진은 출시하지 않는다."
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, diagnose } from "../lib/diagnose/engine.ts";
import { buildReport } from "../lib/diagnose/findings.ts";
import { buildFacts, validateAiReport } from "../lib/diagnose/interpret.ts";
import { autoMap, identifyTable, missingRequired, normalizeTable } from "../lib/diagnose/schema.ts";
import { validateDesign } from "../lib/llm/designer.ts";
import { fails, lintBullet, lintProse } from "../lib/voice/lint.ts";

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
const findingIds = rep.findings.map((f) => f.id).join(",");
check("리포트 1순위 = 레벨 벽, 광고 빈도 개선안 포함", rep.findings[0].id === "level_wall" && findingIds.includes("ad_frequency"), findingIds);
check("리포트 1순위에 1안·2안과 선호 대안", rep.findings[0].options?.length === 2 && !!rep.findings[0].preference, rep.findings[0].preference ?? "없음");

// 문체 규칙 (prompts/voice.md 4-1)
const voiceIssues = [
  ...lintProse(rep.summary, "summary"),
  ...rep.findings.flatMap((f) => [
    ...lintProse(f.title, `${f.id}.title`), ...lintProse(f.body, `${f.id}.body`),
    ...f.evidence.flatMap((e, i) => lintBullet(e.text, `${f.id}.evidence[${i}]`)),
    ...(f.options ?? []).flatMap((o, i) => lintBullet(o.detail, `${f.id}.options[${i}]`)),
  ]),
];
check("규칙 해석이 문체 린터를 통과 (금지어·이모지·물결표·종결 혼용·날조 벤치마크)", fails(voiceIssues).length === 0, fails(voiceIssues).map((i) => i.detail).join(" / ") || "fail 0건");
const bulletEndings = rep.findings.flatMap((f) => f.evidence.map((e) => e.text.trim()));
check("근거 항목은 서술형으로 끝나지 않음, 요약은 서술형", !bulletEndings.some((t) => /(습니다|입니다|합니다|됩니다)\.?$/.test(t)) && /(습니다|입니다)\.$/.test(rep.summary.trim()),
  `근거 ${bulletEndings.length}개 중 서술형 종결 ${bulletEndings.filter((t) => /(습니다|입니다)\.?$/.test(t)).length}개`);
check("비율 차이는 %p로 표기", rep.summary.includes("%p"), rep.summary.match(/[\d.]+%p/)?.[0] ?? "없음");
check("리포트 벽 = L12, 매출 충돌 인지", rep.wall?.level.level === 12 && rep.wall.conflict, `L${rep.wall?.level.level} conflict=${rep.wall?.conflict}`);
check("리포트 목표 클리어율이 정답지 권고(45-50%) 안", rep.wall.targetClearPct >= 45 && rep.wall.targetClearPct <= 50, `${rep.wall.targetClearPct}%`);
check("리포트 1순위 개선안에 1,200원 오퍼", rep.findings[0].body.includes("1,200원"), rep.findings[0].title);
check("리포트 광고: 정점 3-4회, 이후 하락, 마지막 구간 표본 부족 단서", rep.ads.peakLabel === "3-4회" && rep.ads.declinesAfterPeak && rep.ads.last.lowSample && rep.ads.last.n === 39, JSON.stringify(rep.ads));
check("리포트 연속 실패 → 결제 상승 인지", rep.streakRises, String(rep.streakRises));

// 개인정보: 결과에 user_id가 섞여 나가면 안 된다
check("결과 JSON에 user_id 없음", !/u\d{6}/.test(JSON.stringify(m)), "OK");

// AI 해석 입력(사실표)과 숫자 근거 검사
const facts = buildFacts(m, rep);
check("사실표에 user_id 없음, 크기 12KB 이하", !/u\d{6}/.test(facts) && facts.length <= 12_000, `${(facts.length / 1024).toFixed(1)}KB`);
check("사실표에 핵심 수치 포함 (L12 28.3%, 7회 이상 표본 39·표본 부족, 1,200원)", facts.includes("28.3%") && /7회 이상 66\.7% \(표본 39, 표본 부족\)/.test(facts) && facts.includes("1,200원"), "OK");
const grounded = {
  summary: rep.summary,
  findings: rep.findings.map((f) => ({ title: f.title, body: "근거를 보면 이 문제를 먼저 다뤄야 합니다.", tag: f.tag ?? null, evidence: f.evidence, basis: f.id })),
};
const vOk = validateAiReport(grounded, facts);
check("사실표 숫자만 쓴 AI 답은 통과", vOk.ok, vOk.ok ? "OK" : vOk.errors.join(" / "));
const invented = structuredClone(grounded);
invented.findings[0].body = "클리어율을 52.5%로 올리면 D7이 17.3%까지 오를 것입니다.";
const vBad = validateAiReport(invented, facts);
check("사실표에 없는 숫자(52.5, 17.3)를 쓴 AI 답은 거부", !vBad.ok && /52\.5/.test(vBad.errors[0]) && /17\.3/.test(vBad.errors[0]), vBad.ok ? "통과해 버림" : vBad.errors[0]);

// 업로드: 컬럼 이름과 값 형식이 달라도 같은 결과가 나와야 한다
const rename = (rows, map, fn = (r) => r) => rows.map((r) => fn(Object.fromEntries(Object.entries(r).map(([k, v]) => [map[k] ?? k, v]))));
const odd = {
  "players.csv": rename(tables.users, { user_id: "uid", install_date: "first_open" }, (r) => ({ ...r, first_open: r.first_open.replace(/-0?/g, "/"), device_tier: r.device_tier.toUpperCase() })),
  "session_log.csv": rename(tables.sessions, { user_id: "player_id", duration_sec: "playtime_sec", session_start: "started_at" }),
  "stage_log.csv": rename(tables.attempts, { level_id: "stage_no", result: "is_success" }, (r) => ({ ...r, is_success: r.is_success === "clear" ? "true" : "false" })),
  "iap.csv": rename(tables.purchases, { price_krw: "amount" }, (r) => ({ ...r, amount: Number(r.amount).toLocaleString("en-US") })),
  "rewarded_ads.csv": tables.ads,
};
const mapped = { users: [], sessions: [], attempts: [], purchases: [], ads: [] };
const ids = {};
for (const [name, rows] of Object.entries(odd)) {
  const headers = Object.keys(rows[0]);
  const t = identifyTable(headers, name);
  ids[name] = t;
  const mapping = autoMap(t, headers);
  const miss = missingRequired(t, mapping);
  if (miss.length) ids[name] += ` (누락 ${miss})`;
  mapped[t] = normalizeTable(t, rows, mapping).rows;
}
check("업로드: 이름이 다른 CSV 5개를 올바른 테이블로 인식하고 필수 컬럼 자동 매핑",
  JSON.stringify(ids) === JSON.stringify({ "players.csv": "users", "session_log.csv": "sessions", "stage_log.csv": "attempts", "iap.csv": "purchases", "rewarded_ads.csv": "ads" }), JSON.stringify(ids));
const tricky = identifyTable(["attempt_id", "user_id", "session_id", "stg", "is_success", "duration_sec", "boosters_used", "ts"], "stage_log.csv");
check("업로드: duration_sec·ts가 있어도 성공/실패 컬럼이 있으면 레벨 시도로 인식", tricky === "attempts", String(tricky));
const m2 = diagnose(mapped);
check("업로드: 변환한 데이터의 계산 결과가 원본과 동일", JSON.stringify(m2) === JSON.stringify(m), JSON.stringify(m2) === JSON.stringify(m) ? "동일" : "다름");

// 업로드: 유저·세션만 있어도 리포트·사실표가 깨지지 않아야 한다
let partialOk = true;
try {
  const mp = diagnose({ users: tables.users, sessions: tables.sessions, attempts: [], purchases: [], ads: [] });
  const rp = buildReport(mp);
  const fp2 = buildFacts(mp, rp);
  partialOk = mp.levels.length === 0 && rp.wall === null && rp.ads === null && fp2.includes("레벨 시도 데이터 없음");
} catch (e) { partialOk = false; console.error(e); }
check("업로드: 유저·세션만 올려도 계산·리포트·사실표 생성", partialOk, String(partialOk));

// 설계기 검증기: 프리셋은 통과, 규칙 위반은 거부
const presetDir = join(import.meta.dirname, "../public/presets");
const presetResults = ["puzzle", "idle", "gacha-rpg", "roguelike"].map((p) => [p, validateDesign(JSON.parse(readFileSync(join(presetDir, `${p}.json`), "utf8")))]);
check("설계기 검증: 프리셋 4종 통과", presetResults.every(([, v]) => v.ok), presetResults.map(([p, v]) => `${p}:${v.ok ? "ok" : v.errors.join("|")}`).join(" "));
const tooMany = JSON.parse(readFileSync(join(presetDir, "puzzle.json"), "utf8"));
tooMany.events.push(tooMany.events[0]);
delete tooMany.sql_ddl;
const vt = validateDesign(tooMany);
check("설계기 검증: 이벤트 13개·DDL 누락은 거부", !vt.ok && vt.errors.some((e) => e.includes("4-12")) && vt.errors.some((e) => e.includes("sql_ddl")), vt.ok ? "통과해 버림" : vt.errors.join(" / "));

console.log(failed ? `\n${failed}개 실패` : "\n전부 통과");
process.exit(failed ? 1 : 0);
