// AI 해석의 입력(사실표)과 출력 검증.
// 사실표는 브라우저에서 계산한 집계 수치를 사람이 읽는 문장으로 푼 것이다. 유저 단위 값은 들어가지 않는다.
// AI 출력에 사실표에 없는 숫자가 나오면 거부한다. "LLM에게 숫자를 계산시키지 않는다"를 코드로 강제하는 지점.

import type { DiagnosisMetrics } from "./engine.ts";
import { num, pct, won, type Report } from "./findings.ts";

export type AiFinding = {
  title: string;
  body: string;
  tag: string | null;
  evidence: { label: string; text: string }[];
  basis: string;
};
export type AiReport = { summary: string; findings: AiFinding[] };

export const INTERPRET_SYSTEM = `당신은 라이브 서비스 게임의 시니어 데이터 분석가다. 전담 분석가가 없는 소규모 게임 팀에게 진단 결과를 설명한다.
입력으로 받는 "사실표"는 코드가 이미 계산한 집계 수치다. 당신의 일은 해석과 가설, 실행할 개선안이다.

## 반드시 지킬 것
1. 숫자를 계산하지 마라. 사실표에 적힌 숫자만 그대로 인용한다. 새 숫자(합계, 차이, 비율, 추정치, 목표치, 기간)를 만들지 마라.
   목표 클리어율처럼 권고치가 필요하면 사실표의 "규칙 후보"에 적힌 값만 쓴다.
2. 표본 부족으로 표시된 구간은 결론을 내리지 말고 단서를 달아라.
3. 상관을 인과로 말하지 마라. 원인은 "가설"로, 확인 방법과 함께 제시한다.
4. 두 신호가 서로 반대 방향의 개선을 요구하면(예: 이탈 지점이 곧 결제 지점) 반드시 그 충돌을 짚고 균형점을 제안한다.
5. 사실표에 없다고 적힌 데이터(예: 결제 퍼널)는 분석한 척하지 마라.
6. 한국어 합니다체. 짧고 구체적으로. 업계 벤치마크 수치를 지어내지 마라.
7. 사실표에 "광고 - 올바른 집계"가 있으면 광고 빈도 해석을 finding 하나로 반드시 넣는다. 정점 구간을 말하고, "틀린 집계"가 왜 틀렸는지 한 문장으로 짚고, 표본 부족 구간에는 결론 대신 단서를 단다.
8. 오퍼나 상품을 제안할 때는 사실표의 "가장 싼 상품" 이름과 가격을 그대로 인용한다.
9. 연속 실패 수별 결제 비율이 상승한다고 적혀 있으면, 난이도 조정 제안에 그 사실(좌절이 결제 트리거)을 근거로 쓴다.

## 출력
JSON 하나만 출력한다.
{
  "summary": "리포트 맨 위 한 문단 요약. 3-5문장. 가장 중요한 문제와 (있다면) 신호 간 충돌",
  "findings": [
    {
      "title": "먼저 고칠 것. 명령형 한 문장",
      "body": "왜 이것을 고쳐야 하는지와 어떻게 할지. 2-3문장",
      "tag": "매출 영향 있음 같은 짧은 경고 라벨. 없으면 null",
      "evidence": [{"label": "근거 | 상충 지점 | 검증 방법 | 먼저 확인할 것 | 필요한 데이터 | 한계 | 주의", "text": "한 문장"}],
      "basis": "level_wall | device_perf | channel_quality | ads | monetization | retention | other"
    }
  ]
}
findings는 영향이 큰 순서로 3-4개, evidence는 각 3개.`;

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
    findings.push({ title: f.title, body: f.body, tag: f.tag ?? null, evidence: f.evidence ?? [], basis: typeof f.basis === "string" ? f.basis : "other" });
  });
  if (errors.length) return { ok: false, errors };

  const report = { summary: o.summary as string, findings };
  const bad = ungroundedNumbers(JSON.stringify(report), facts);
  if (bad.length) return { ok: false, errors: [`사실표에 없는 숫자를 썼음: ${bad.slice(0, 12).join(", ")}. 사실표의 숫자만 그대로 인용하거나 숫자 없이 표현하라`] };
  return { ok: true, report };
}
