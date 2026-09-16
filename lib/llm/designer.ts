// 지표 설계기 프롬프트와 출력 검증.
// DESIGNER_SYSTEM은 ../prompts/designer.v1.md "시스템 프롬프트" 블록을 그대로 옮긴 것이다. 원본을 고치면 여기도 같이 고친다.

import type { DesignResult } from "../types.ts";

export const DESIGNER_SYSTEM = `당신은 라이브 서비스 게임의 데이터 분석 설계자다. MAU 100만 이상 타이틀에서
지표 체계를 설계하고 운영한 경험이 있다. 지금 상대는 전담 분석가가 없는 소규모 게임 팀이다.

당신의 임무는 이 팀이 "무엇을 쌓아야 하는지"를 결정해 주는 것이다.
완벽한 설계가 아니라, 이 팀이 실제로 구현하고 실제로 들여다볼 설계를 내놓아야 한다.

## 반드시 지킬 설계 원칙

1. 이벤트는 12개를 넘기지 마라. 소규모 팀이 100개를 심으면 하나도 보지 않는다.
   덜 심고 확실히 보는 쪽이 항상 낫다.
2. 모든 이벤트에 user_id, event_ts, session_id, day_n(설치 후 경과일)을 공통 필드로 둔다.
   day_n이 없으면 코호트 분석 자체가 불가능하다.
3. 핵심 루프의 네 지점을 반드시 포함한다: 진입, 성공, 실패, 중단.
   대부분의 팀이 성공만 찍고 실패와 중단을 빠뜨린다. 이탈 원인은 실패 쪽에 있다.
4. 수익화는 노출 - 클릭 - 구매 세 단계를 분리해 찍는다.
   구매만 찍으면 퍼널이 안 보이고, 전환이 어디서 깨졌는지 영원히 알 수 없다.
5. 재화 변동은 획득과 소비를 하나의 테이블에 reason 코드와 함께 남긴다.
   인게임 경제를 추적하려면 이것이 최소 조건이다.
6. 기기, OS, 획득 채널, 국가는 유저 테이블의 고정 속성이다. 이벤트마다 반복하지 마라.
7. 무엇을 찍지 말아야 하는지도 말해 줘라. 과설계는 인디 팀이 분석을 포기하는 첫 번째 이유다.
8. 각 이벤트마다 역할과 쓰임을 밝혀라. "이게 없으면 못 본다"는 식으로 쓰지 말고,
   루프의 어느 지점을 찍는 이벤트인지와 어떤 지표의 분자·분모가 되는지를 적는다.
   used_for에는 이 설계서의 kpis에 실제로 있는 지표 이름을 쓴다.
9. 출력은 한국어로 쓴다. 이벤트명, 속성명, 테이블·컬럼명 같은 코드 식별자만 영문 snake_case로 쓰고
   지표 이름과 설명 문장은 한국어로 쓴다.
10. do_not_track은 팀에게 직접 말하는 자리다. 존댓말 서술형으로 쓴다. 나머지 필드는 설명문이므로 평서형으로 쓴다.

## 금지 사항

- 지표를 직접 계산하지 마라. 당신은 설계만 한다.
- 장르 불문 일반론(DAU, MAU, 리텐션만 나열)을 내지 마라. 입력된 핵심 루프에서
  이 게임에만 해당하는 이벤트를 도출해야 한다.
- 업계 벤치마크 수치를 지어내지 마라. 모르면 "측정 후 자체 기준선을 세우라"고 하라.

## 출력 형식

아래 JSON 하나만 출력한다. 설명 문장이나 코드 펜스를 덧붙이지 않는다.

{
  "game_summary": "이 게임의 핵심 루프를 분석 관점에서 한 문장으로 재서술",
  "events": [
    {
      "name": "snake_case 이벤트명",
      "role": "이 이벤트가 핵심 루프에서 맡는 역할 한 문장 (진입/성공/실패/중단/경제/수익화 중 어디인지가 드러나게)",
      "used_for": ["이 이벤트로 계산하는 지표 이름", "..."],
      "properties": [{"name": "", "type": "string|int|float|bool|timestamp", "note": ""}],
      "priority": "must | should"
    }
  ],
  "user_properties": [{"name": "", "type": "", "note": ""}],
  "kpis": [
    {
      "name": "지표명",
      "formula": "이 스키마의 이벤트로 계산 가능한 실제 계산식",
      "why_this_game": "이 게임에서 왜 이 지표가 중요한지",
      "watch_out": "이 지표를 잘못 읽는 흔한 방식"
    }
  ],
  "ab_test": {
    "hypothesis": "무엇을 바꾸면 어떤 지표가 어느 방향으로 움직일 것인가",
    "primary_metric": "1차 지표 하나. 반드시 하나만",
    "guardrail_metrics": ["악화되면 실험을 중단할 지표"],
    "unit": "randomization unit (보통 user_id)",
    "min_duration_days": 7,
    "sample_size_note": "표본 크기 계산에 필요한 입력값과 계산 방법"
  },
  "do_not_track": ["지금 단계에서 찍지 말 것과 그 이유. 존댓말 서술형 한두 문장 (~하세요, ~습니다)"],
  "sql_ddl": "위 스키마의 CREATE TABLE 문 (표준 SQL)"
}

## 계산식 작성 규칙

- 리텐션은 classic N-day 정의를 기본으로 쓴다. rolling 정의와 혼용하면 수치가 어긋난다.
  계산식에 어떤 정의인지 반드시 명시하라.
- 모든 비율 지표는 분모를 명시하라. "결제 전환율"은 설치 기준인지 DAU 기준인지에 따라
  열 배 차이가 난다.
- ARPPU와 ARPDAU를 구분하고, 어느 쪽을 볼지 이 게임의 수익화 모델에 맞춰 지정하라.`;

export type DesignInput = {
  genre: string;
  core_loop: string;
  monetization: string;
  platform: string;
  stage: string;
};

export const MONETIZATION = ["IAP", "광고", "혼합", "구독", "미정"];
export const PLATFORM = ["iOS", "Android", "PC", "복수"];
export const STAGE = ["출시 전", "소프트론칭", "출시 후"];

export function designUserPrompt(i: DesignInput) {
  return `장르: ${i.genre}
핵심 루프: ${i.core_loop}
수익화: ${i.monetization}
플랫폼: ${i.platform}
출시 단계: ${i.stage}

위 게임의 지표 체계를 설계하라.`;
}

export function parseDesignInput(v: unknown): { ok: true; input: DesignInput } | { ok: false; message: string } {
  const o = (v ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const input: DesignInput = {
    genre: s("genre"),
    core_loop: s("core_loop"),
    monetization: s("monetization"),
    platform: s("platform"),
    stage: s("stage"),
  };
  if (input.genre.length < 2 || input.genre.length > 60) return { ok: false, message: "장르를 2-60자로 적어 주세요" };
  if (input.core_loop.length < 30) return { ok: false, message: "핵심 루프를 두세 문장(30자 이상)으로 적어 주세요. 유저가 무엇을 반복하고, 어디서 성공·실패하는지가 들어가면 좋습니다" };
  if (input.core_loop.length > 1000) return { ok: false, message: "핵심 루프는 1,000자 이내로 적어 주세요" };
  if (!MONETIZATION.includes(input.monetization)) return { ok: false, message: "수익화 모델을 골라 주세요" };
  if (!PLATFORM.includes(input.platform)) return { ok: false, message: "플랫폼을 골라 주세요" };
  if (!STAGE.includes(input.stage)) return { ok: false, message: "출시 단계를 골라 주세요" };
  return { ok: true, input };
}

const str = (v: unknown, max = 4000) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const props = (v: unknown) => Array.isArray(v) && v.every((p) => p && str(p.name, 80) && typeof p.type === "string");

/** 프리셋과 같은 모양인지, 프롬프트 원칙(이벤트 12개 이하 등)을 지켰는지 본다. */
export function validateDesign(v: unknown): { ok: true; result: DesignResult } | { ok: false; errors: string[] } {
  const e: string[] = [];
  const o = v as Partial<DesignResult> | null;
  if (!o || typeof o !== "object") return { ok: false, errors: ["최상위가 객체가 아님"] };
  if (!str(o.game_summary, 1000)) e.push("game_summary");
  if (!Array.isArray(o.events) || o.events.length < 4 || o.events.length > 12) e.push("events는 4-12개여야 함");
  else o.events.forEach((ev, i) => {
    if (!ev || !str(ev.name, 60) || !/^[a-z][a-z0-9_]*$/.test(ev.name)) e.push(`events[${i}].name은 snake_case`);
    if (!ev || !str(ev.role, 400)) e.push(`events[${i}].role`);
    if (!ev || !Array.isArray(ev.used_for) || !ev.used_for.length || !ev.used_for.every((u) => str(u, 120))) e.push(`events[${i}].used_for는 지표 이름 배열`);
    if (!ev || !props(ev.properties)) e.push(`events[${i}].properties는 {name,type} 배열`);
    if (!ev || !["must", "should"].includes(String(ev.priority).trim())) e.push(`events[${i}].priority는 must 또는 should`);
  });
  if (!props(o.user_properties) || !(o.user_properties as unknown[]).length) e.push("user_properties는 {name,type} 배열");
  if (!Array.isArray(o.kpis) || o.kpis.length < 3 || !o.kpis.every((k) => k && str(k.name, 120) && str(k.formula, 1500) && str(k.why_this_game, 1000) && str(k.watch_out, 1000))) {
    e.push("kpis는 name/formula/why_this_game/watch_out을 가진 3개 이상");
  }
  const ab = o.ab_test;
  if (!ab || typeof ab !== "object") e.push("ab_test 객체 누락");
  else {
    if (!str(ab.hypothesis, 800)) e.push("ab_test.hypothesis");
    if (!str(ab.primary_metric, 300)) e.push("ab_test.primary_metric");
    if (!Array.isArray(ab.guardrail_metrics) || !ab.guardrail_metrics.length || !ab.guardrail_metrics.every((g) => str(g, 400))) e.push("ab_test.guardrail_metrics는 비어 있지 않은 문자열 배열");
    if (!str(ab.unit, 300)) e.push("ab_test.unit");
    if (typeof ab.min_duration_days !== "number") e.push("ab_test.min_duration_days는 숫자");
    if (!str(ab.sample_size_note, 1500)) e.push("ab_test.sample_size_note");
  }
  if (!Array.isArray(o.do_not_track) || !o.do_not_track.length || !o.do_not_track.every((d) => str(d, 800))) e.push("do_not_track은 비어 있지 않은 문자열 배열");
  if (!str(o.sql_ddl, 20_000) || !/create\s+table/i.test(o.sql_ddl as string)) e.push("sql_ddl에 CREATE TABLE이 있어야 함");
  if (e.length) return { ok: false, errors: e };
  const result = o as DesignResult;
  result.events.forEach((ev) => { ev.priority = String(ev.priority).trim(); });
  return { ok: true, result };
}
