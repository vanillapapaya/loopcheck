// AI 해석의 입력(사실표)과 출력 검증.
// 사실표는 브라우저에서 계산한 집계 수치를 사람이 읽는 문장으로 푼 것이다. 유저 단위 값은 들어가지 않는다.
// AI 출력에 사실표에 없는 숫자가 나오면 거부한다. "LLM에게 숫자를 계산시키지 않는다"를 코드로 강제하는 지점.

import type { DiagnosisMetrics } from "./engine.ts";
import { num, pct, won, type Report } from "./findings.ts";
import { fails, lintBullet, lintProse } from "../voice/lint.ts";

export type AiFinding = {
  title: string;
  body: string;
  tag: string | null;
  evidence: { label: string; text: string }[];
  /** 실행 방법이 갈리는 경우의 1안·2안 */
  options?: { label: string; detail: string }[];
  /** 선호안과 막혔을 때의 대안 경로 */
  preference?: string | null;
  basis: string;
};
export type AiReport = { summary: string; findings: AiFinding[] };

export const INTERPRET_SYSTEM = `당신은 라이브 서비스 게임의 시니어 데이터 분석가다. 전담 분석가가 없는 소규모 게임 팀에게 진단 결과를 설명한다.
입력으로 받는 "사실표"는 코드가 이미 계산한 집계 수치다. 당신의 일은 해석과 가설, 실행할 개선안이다.

## 반드시 지킬 것
1. 숫자를 계산하지 마라. 사실표에 적힌 숫자만 그대로 인용한다. 새 숫자(합계, 차이, 비율, 추정치, 목표치, 기간)를 만들지 마라.
   목표 클리어율처럼 권고치가 필요하면 사실표의 "규칙 후보"에 적힌 값만 쓴다. 사실표에 %p 차이가 적혀 있으면 그 값을 그대로 인용한다.
2. 표본 부족으로 표시된 구간은 결론을 내리지 말고 단서를 달아라.
3. 상관을 인과로 말하지 마라. 원인은 "가설"로, 확인 방법과 함께 제시한다.
4. 두 신호가 서로 반대 방향의 개선을 요구하면(예: 이탈 지점이 곧 결제 지점) 반드시 그 충돌을 짚고 균형점을 제안한다.
5. 사실표에 없다고 적힌 데이터(예: 결제 퍼널)는 분석한 척하지 마라.
6. 사실표에 "광고 - 올바른 집계"가 있으면 광고 빈도 해석을 finding 하나로 반드시 넣는다. 4단 논증 형태로 쓴다.
7. 오퍼나 상품을 제안할 때는 사실표의 "가장 싼 상품" 이름과 가격을 그대로 인용한다.
8. 연속 실패 수별 결제 비율이 상승한다고 적혀 있으면, 난이도 조정 제안에 그 사실(좌절이 결제 트리거)을 근거로 쓴다.
9. 검증 방법을 쓸 때 A/B 테스트를 권하지 마라. 게임에서 유저마다 난이도·가격·보상을 다르게 주는 것은 형평성 문제이고,
   소규모 팀의 유입으로는 표본도 모자란다. 사실표의 "검증 설계"를 인용해, 전원에게 같은 변경을 적용하고
   영향군과 비교군의 변화량 차이로 확인하라고 쓴다. "확인 어려움"으로 적혀 있으면 그 사실과 대안을 함께 쓴다.

## 문체 규칙

너는 라이브 서비스 게임 지표를 5년간 다룬 분석가의 문체로 쓴다. 사내 보고서를 쓰던 사람이
외부 팀에게 설명하는 톤이다. 아래 규칙을 예외 없이 지킨다.

### 종결

구간마다 종결이 다르다.

- 한 문단 요약, 개선안 제목과 본문 → 서술형 (~합니다, ~입니다)
- 근거 항목, 세그먼트 비교, 정의와 기준 각주 → 명사형 개조식 (~기록, ~보임, ~확인, ~필요, ~차지, ~순)

명사형 구간에서 "~습니다"를 쓰지 않는다. 서술형 구간에서 명사형으로 끝내지 않는다.

### 수치

모든 수치는 [값] + [비교 대상] + [차이]를 한 문장에 담는다. 값만 던지지 않는다.

형식: \`[지표] [값] 기록, [비교 대상]([그 값]) 대비 [차이] 증가/감소\`

- 비교 대상은 큰따옴표로 감싸고 그 값을 괄호에 넣는다
- 비교 대상의 조건을 한 마디로 덧붙인다 (예: "직전 레벨인", "같은 기간의")
- **비율의 차이는 반드시 %p로 쓴다.** 20.4%와 14.3%의 차이는 6.1%p이지 6.1%가 아니다
- 값 자체의 증감률은 %로 쓴다
- 증감은 "증가", "감소"로 풀어쓴다. 화살표 기호를 쓰지 않는다

### 세그먼트 비교

값을 모두 나열한 뒤 부등호로 순위를 한 번 더 보여준다. 값만 늘어놓고 끝내지 않는다.

형식: \`[지표]는 [A] [값], [B] [값], [C] [값]로 [A] > [C] > [B] 순\`

### 분포

꼬리가 긴 분포는 평균을 말하지 않는다. 분위수를 나열해 분포 모양 자체를 보여준다.

형식: \`상위 10%가 [값], 상위 20%가 [값], 상위 30%가 [값], 중위권(50%)이 [값]\`

### 논증 — 첫 발견을 의심한다

상관관계를 그대로 결론으로 옮기지 않는다. 교란 요인이 의심되면 네 걸음으로 쓴다.

1) \`데이터 확인 결과, [관찰]\`
2) \`하지만 [교란 요인]이 포함됨\`
3) \`[교란 요인]은 [결과]와 관계가 없기 때문에 분리 작업이 필요\`
4) \`분리 결과, [교란 제거 후의 진짜 관찰]\`

### 근거 수치의 위치

주장을 먼저 말하고 통계량을 괄호로 받친다. 통계량으로 문장을 시작하지 않는다.

- O: \`소요 시간이 길수록 직후 단계의 진입률이 낮음(상관계수 -0.7로 역상관관계가 높음)\`
- X: \`상관계수가 -0.7이므로 소요 시간과 진입률은 역상관이다\`

### 정의와 기준

지표마다 무엇을 기준으로 셌는지 각주로 단다. 분모와 시점 기준이 문서 안에 반드시 있어야 한다.

- \`※ [용어] : [조작적 정의]\`
- \`- [지표] : [무엇을 기준으로 집계했는지]\`
- 리텐션은 classic N-day인지 rolling인지 명시한다
- 비율은 분모가 무엇인지 명시한다

### 제외한 표본

분석에서 뺀 것이 있으면 무엇을 왜 뺐는지 남긴다.

- \`- [대상]은 [사유]로 분석에서 제외\`

### 개선안

번호 안으로 나누고, 선호를 밝히고, 그게 막힐 경우의 경로까지 적는다.


## 예시

### 한 문단 요약 (서술형)

나쁜 예 — 비교 대상이 없고, 과장어를 쓰고, 없는 업계 평균을 지어냈다:
"레벨 12에서 클리어율이 크게 떨어집니다. 무려 28.3%밖에 되지 않아 매우 심각한 수준입니다. 업계 평균이 50% 전후인 것을 감안하면 시급히 개선이 필요합니다."

좋은 예:
"이 게임의 이탈은 리텐션 곡선 전반이 아니라 레벨 12 한 지점에 몰려 있습니다. 시도 대비 클리어율 28.3% 기록, 직전 레벨인 L11(62.0%) 대비 33.7%p 감소로 전 구간 최대 낙폭입니다. 다만 같은 레벨이 첫 결제가 가장 많이 발생한 단일 레벨이기도 해, 난이도만 낮추면 매출이 함께 빠질 수 있습니다."

### 근거 항목 (명사형 개조식)

나쁜 예 — 명사형 구간에 서술형을 썼고 분모 기준이 없다:
"레벨 12에 2,267명이 도달했고 그 중 340명이 다음 레벨로 가지 못했습니다."

좋은 예:
"레벨 12 도달 2,267명 중 340명(15.0%)이 다음 레벨 미진입"
"시도 대비 클리어율 28.3%, 도달자 대비 기준과 함께 확인 필요. 두 값이 벌어지는 레벨이 재도전 구간"
"첫 결제 발생 단일 레벨 1위(22건) 차지"

### 생존 편향 처리 (논증 4단, 근거 항목에 나눠 담는다)

"데이터 확인 결과, 누적 광고 시청량이 많은 유저일수록 D7 잔존율이 높음(31회 이상 구간 100%)"
"하지만 오래 잔존한 유저일수록 광고 시청 누적량이 커지는 구조로, 생존 편향이 포함됨. 누적량은 잔존 기간의 결과이므로 경과일 고정 후 재집계가 필요"
"분리 결과, 경과일 1-3일 고정 시 당일 1-2회 67.4%, 3-4회 77.4%, 5-6회 75.3%, 7회 이상 66.7%로 3-4회 > 5-6회 > 1-2회 > 7회 이상 순"
"단 7회 이상 구간은 n이 39로 결론을 내리기에 부족. 광고 상한 조정 전 표본 축적 또는 A/B 확인 권장"

### 세그먼트 비교 (순위 부등호)

"평균 세션 길이는 고사양 9.5분, 중사양 8.0분, 저사양 4.5분으로 고사양 > 중사양 > 저사양 순"
"저사양 구간이 전체 설치의 30.3% 차지. 콘텐츠가 동일한데 체류가 절반에 못 미치므로 성능 요인 의심"

## 출력
JSON 하나만 출력한다.
{
  "summary": "리포트 맨 위 한 문단 요약. 서술형. 3-5문장. 가장 중요한 문제와 (있다면) 신호 간 충돌",
  "findings": [
    {
      "title": "먼저 고칠 것. 서술형 명령 한 문장",
      "body": "왜 이것을 고쳐야 하는지. 서술형 2-3문장",
      "tag": "매출 영향 있음 같은 짧은 경고 라벨. 없으면 null",
      "evidence": [{"label": "근거 | 상충 지점 | 검증 방법 | 먼저 확인할 것 | 필요한 데이터 | 한계 | 주의", "text": "명사형 개조식 한 줄"}],
      "options": [{"label": "1안 - 무엇을 바꾸는가", "detail": "구체적 실행 방법. 명사형"}],
      "preference": "선호하는 추천은 1안이나 [제약]이 있다면 [대안 방향]으로 대안 마련",
      "basis": "level_wall | device_perf | channel_quality | ads | monetization | retention | other"
    }
  ]
}
findings는 영향이 큰 순서로 3-4개. evidence는 각 3개이고 전부 명사형으로 끝낸다.
options는 실행 방법이 갈리는 finding에만 2개까지 넣고, 넣었으면 preference도 함께 쓴다. 없으면 둘 다 생략한다.`;

// ---------- 사실표 ----------

export function buildFacts(m: DiagnosisMetrics, rep: Report): string {
  const L: string[] = [];
  const push = (s: string) => L.push(s);

  push(`[개요] 관측 ${m.meta.obsStart} ~ ${m.meta.obsEnd}, 설치 ${num(m.meta.users)}명, 세션 ${num(m.meta.sessions)}건, 레벨 시도 ${num(m.meta.attempts)}건, 결제 ${num(m.meta.purchases)}건, 광고 시청 ${num(m.meta.adViews)}건`);
  push(`[리텐션 classic N-day, 분모는 N일째가 관측된 유저] ` + m.retention.map((x) => `D${x.day} ${pct(x.r.rate)} (분모 ${num(x.r.den)})`).join(", "));

  if (m.levels.length) {
    const byLv = new Map(m.levels.map((l) => [l.level, l]));
    const lv = (n: number) => {
      const l = byLv.get(n);
      return l ? `L${n}: 도달 ${num(l.reached)}명, 시도 대비 클리어 ${pct(l.attemptClear.rate)}, 도달자 대비 클리어 ${pct(l.reachClear.rate)}, 다음 레벨 미도달 ${pct(l.stuck.rate)} (${num(l.stuck.num)}명)` : null;
    };
    if (rep.wall) {
      const w = rep.wall.level.level;
      push(`[난이도 벽 후보] 직전 대비 클리어율 낙폭이 가장 큰 레벨 = L${w}`);
      [w - 1, w, w + 1].map(lv).filter(Boolean).forEach((s) => push(`  ${s}`));
    }
    const topStuck = [...m.levels].filter((l) => l.reached >= Math.max(100, m.meta.users * 0.02)).sort((a, b) => b.stuck.rate - a.stuck.rate).slice(0, 5);
    push(`[미도달률 상위 레벨] ` + topStuck.map((l) => `L${l.level} ${pct(l.stuck.rate)}`).join(", "));
  } else {
    push(`[레벨] 레벨 시도 데이터 없음`);
  }

  const seg = (name: string, list: DiagnosisMetrics["segments"]["channel"]) => {
    if (list.length < 2) return;
    push(`[${name}] ` + list.map((s) => `${s.key}: 설치 비중 ${pct(s.share)}, D1 ${pct(s.d1.rate)}, D7 ${pct(s.d7.rate)}${s.avgSessionMin != null ? `, 평균 세션 ${s.avgSessionMin.toFixed(1)}분` : ""}`).join(" / "));
  };
  seg("채널별", m.segments.channel);
  seg("기기 등급별", m.segments.deviceTier);
  seg("플랫폼별", m.segments.platform);
  const andLow = m.segments.tierShareWithinPlatform.find((x) => x.platform === "android" && x.tier === "low");
  if (andLow) push(`[기기 구성] Android 설치 중 저사양 비중 ${pct(andLow.share)}`);

  const mo = m.monetization;
  if (m.meta.purchases) {
    push(`[결제] 결제자 ${num(mo.payers.num)}명, 설치 대비 결제 전환 ${pct(mo.payers.rate, 2)}, 총 매출 ${won(mo.revenueKrw)}, ARPPU ${mo.arppuKrw != null ? won(mo.arppuKrw) : "없음"}, 설치당 매출 ${won(mo.revenueKrw / Math.max(1, m.meta.users))}`);
    push(`[상품] ` + mo.byProduct.map((p) => `${p.productId}(${won(p.priceKrw)}) ${num(p.count)}건`).join(", "));
    const cheapest = [...mo.byProduct].sort((a, b) => a.priceKrw - b.priceKrw)[0];
    if (cheapest) push(`[가장 싼 상품] ${cheapest.productId} ${won(cheapest.priceKrw)}`);
    push(`[첫 결제 레벨 상위] ` + mo.firstPurchaseLevel.slice(0, 5).map((x) => `L${x.level} ${num(x.count)}건`).join(", "));
    if (m.meta.attempts) push(`[연속 실패 수별 실패 직후 결제 비율] ` + mo.buyAfterFailStreak.map((s) => `${s.streak}${s.streak === 5 ? "회 이상" : "회"} ${pct(s.r.rate, 2)}`).join(", ") + (rep.streakRises ? " (연속 실패가 늘수록 상승)" : ""));
  } else {
    push(`[결제] 결제 데이터 없음`);
  }
  push(`[결제 퍼널] 오퍼 노출·클릭 로그가 없어 노출→클릭→구매 퍼널은 계산할 수 없음`);

  if (m.meta.adViews) {
    push(`[광고 - 틀린 집계, 생존 편향] 누적 시청 수별 D7: ` + m.ads.naiveCumulativeD7.map((b) => `${b.label} ${pct(b.d7.rate)}`).join(", ") + ". 오래 남은 유저가 광고를 많이 본 것이라 인과로 읽으면 안 됨");
    push(`[광고 - 올바른 집계] 경과 ${m.ads.fixedDay.dayFrom}~${m.ads.fixedDay.dayTo}일 고정, 당일 시청 수별 익일 접속: ` + m.ads.fixedDay.buckets.map((b) => `${b.label} ${pct(b.nextDay.rate)} (표본 ${num(b.nextDay.den)}${b.lowSample ? ", 표본 부족" : ""})`).join(", "));
  } else {
    push(`[광고] 광고 시청 데이터 없음`);
  }

  if (rep.findings.length) {
    push(`[규칙 후보 - 코드가 먼저 뽑은 개선안. 순서와 문장은 바꿔도 되지만 숫자는 여기 것만]`);
    if (rep.wall) push(`  권장 목표: L${rep.wall.level.level} 시도 대비 클리어율 ${rep.wall.targetClearPct}% 안팎${rep.wall.conflict ? ". 이 레벨이 첫 결제 1위 레벨이기도 함(충돌)" : ""}`);
    rep.findings.forEach((f) => push(`  - ${f.title} | ${f.evidence.map((e) => `${e.label}: ${e.text}`).join(" | ")}`));
  }
  const designs = rep.findings.filter((f) => f.design);
  if (designs.length) {
    push(`[검증 설계 - 유저를 나누지 않고 전원에게 적용한 뒤 영향군과 비교군의 변화량 차이로 본다(이중차분). 숫자는 코드가 계산함]`);
    for (const f of designs) {
      const d = f.design!;
      push(`  ${f.id}: 개입 ${d.intervention} / 영향군 ${d.treated.label} ${num(d.treated.users)}명 대 비교군 ${d.control.label} ${num(d.control.users)}명 / 지표 ${d.outcome} / 변경 전후 각 ${d.daysPerPeriod}일, 검출 가능한 최소 효과 ${d.mdePp.toFixed(1)}%p / ${d.feasible ? "이 규모에서 확인 가능" : `이 규모에서는 확인 어려움. 대안: ${d.fallback}`} / 사전 점검 ${d.precheck}`);
    }
  }
  if (rep.ads) {
    const a = rep.ads;
    push(`[규칙 후보 - 광고] 당일 시청 ${a.peakLabel}에서 익일 접속 ${pct(a.peakRate)}로 정점${a.declinesAfterPeak ? `, ${a.last.label}에서 ${pct(a.last.rate)}로 하락` : ""}${a.last.lowSample ? `. 단 ${a.last.label}은 표본 ${num(a.last.n)}개라 결론 보류` : ""}`);
  }
  return L.join("\n");
}

// ---------- 숫자 근거 검사 ----------

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
const norm = (s: string) => {
  const n = s.replace(/,/g, "");
  return n.includes(".") ? String(parseFloat(n)) : String(parseInt(n, 10));
};
export function numbersIn(text: string): string[] {
  return (text.match(NUM_RE) ?? []).map(norm);
}

/** 사실표에 없는 숫자 목록. 10 이하의 정수(순위, 개수, "3-4회")는 허용한다. */
export function ungroundedNumbers(output: string, facts: string): string[] {
  const allowed = new Set(numbersIn(facts));
  const bad = numbersIn(output).filter((n) => !allowed.has(n) && !(Number.isInteger(+n) && +n <= 10));
  return [...new Set(bad)];
}

// ---------- 출력 형식 검사 ----------

const isStr = (v: unknown, max = 2000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

export function validateAiReport(v: unknown, facts: string): { ok: true; report: AiReport } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const o = v as Partial<AiReport> | null;
  if (!o || typeof o !== "object") return { ok: false, errors: ["최상위가 객체가 아님"] };
  if (!isStr(o.summary, 1200)) errors.push("summary가 비었거나 너무 김");
  else errors.push(...fails(lintProse(o.summary, "summary")).map((i) => `[${i.rule}] ${i.detail}`));
  if (!Array.isArray(o.findings) || o.findings.length < 1 || o.findings.length > 4) errors.push("findings는 1-4개 배열이어야 함");
  const findings: AiFinding[] = [];
  (Array.isArray(o.findings) ? o.findings : []).forEach((f, i) => {
    const p = `findings[${i}]`;
    if (!f || typeof f !== "object") { errors.push(`${p}가 객체가 아님`); return; }
    if (!isStr(f.title, 120)) errors.push(`${p}.title`);
    if (!isStr(f.body, 800)) errors.push(`${p}.body`);
    if (f.tag != null && !isStr(f.tag, 20)) errors.push(`${p}.tag는 짧은 문자열 또는 null`);
    if (!Array.isArray(f.evidence) || f.evidence.length < 1 || f.evidence.length > 4 || !f.evidence.every((e) => e && isStr(e.label, 20) && isStr(e.text, 300))) {
      errors.push(`${p}.evidence는 {label,text} 1-4개`);
    }
    const options = Array.isArray(f.options)
      ? f.options.filter((o) => o && isStr(o.label, 80) && isStr(o.detail, 300)).slice(0, 3)
      : [];
    if (Array.isArray(f.options) && options.length !== f.options.length) errors.push(`${p}.options는 {label,detail} 형식`);
    if (f.preference != null && !isStr(f.preference, 300)) errors.push(`${p}.preference`);

    // 문체 검사: 제목·본문은 서술형, 근거와 실행 방법은 명사형
    const issues = [
      ...lintProse(f.title, `${p}.title`), ...lintProse(f.body, `${p}.body`),
      ...(f.evidence ?? []).flatMap((e, j) => lintBullet(e?.text ?? "", `${p}.evidence[${j}]`)),
      ...options.flatMap((o, j) => lintBullet(o.detail, `${p}.options[${j}]`)),
    ];
    errors.push(...fails(issues).map((i) => `[${i.rule}] ${i.detail}`));

    findings.push({
      title: f.title, body: f.body, tag: f.tag ?? null, evidence: f.evidence ?? [],
      options: options.length ? options : undefined,
      preference: options.length ? (f.preference ?? null) : undefined,
      basis: typeof f.basis === "string" ? f.basis : "other",
    });
  });
  if (errors.length) return { ok: false, errors };

  const report = { summary: o.summary as string, findings };
  const bad = ungroundedNumbers(JSON.stringify(report), facts);
  if (bad.length) return { ok: false, errors: [`사실표에 없는 숫자를 썼음: ${bad.slice(0, 12).join(", ")}. 사실표의 숫자만 그대로 인용하거나 숫자 없이 표현하라`] };
  return { ok: true, report };
}
