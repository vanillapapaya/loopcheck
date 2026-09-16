// 프리셋 4종의 이벤트 설명을 role/used_for 형태로 바꾼다. 일회성 스크립트.
// 실행: node --env-file=.env.local scripts/rewrite-presets.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, parseJsonObject } from "../lib/llm/gemini.ts";

const dir = join(import.meta.dirname, "../public/presets");
const SYSTEM = `너는 라이브 서비스 게임의 데이터 분석 설계자다. 주어진 이벤트 스키마의 각 이벤트에 대해 두 가지를 쓴다.

- role: 이 이벤트가 핵심 루프에서 맡는 역할 한 문장. 진입/성공/실패/중단/경제/수익화 중 어디를 찍는 이벤트인지가 드러나야 한다.
  "이게 없으면 못 본다"는 식으로 쓰지 마라. 무엇을 기록하는 이벤트인지와 그것이 왜 루프의 그 지점인지를 쓴다. 명사형이 아니라 서술형(~한다)으로 끝낸다.
- used_for: 이 이벤트로 계산하는 지표 이름 배열. 2-4개. 반드시 입력으로 준 kpis 목록의 이름이나 그 계산에 직접 쓰이는 표준 지표명(예: D1 리텐션, 레벨별 클리어율, 결제 전환율)만 쓴다. 지어내지 마라.

과장어와 이모지를 쓰지 않는다. JSON 하나만 출력한다.
{"events": [{"name": "입력과 같은 이벤트명", "role": "...", "used_for": ["...", "..."]}]}`;

for (const id of ["puzzle", "idle", "gacha-rpg", "roguelike"]) {
  const path = join(dir, `${id}.json`);
  const d = JSON.parse(readFileSync(path, "utf8"));
  const input = {
    game_summary: d.game_summary,
    kpis: d.kpis.map((k) => k.name),
    events: d.events.map((e) => ({ name: e.name, properties: e.properties.map((p) => p.name), 기존설명: e.why ?? e.role })),
  };
  const { text, model } = await generate({
    system: SYSTEM,
    turns: [{ role: "user", text: JSON.stringify(input, null, 1) }],
    temperature: 0.3,
    maxOutputTokens: 8192,
  });
  const out = parseJsonObject(text);
  const byName = new Map(out.events.map((e) => [e.name, e]));
  let missing = 0;
  for (const e of d.events) {
    const got = byName.get(e.name);
    if (!got?.role || !Array.isArray(got.used_for) || !got.used_for.length) { missing++; continue; }
    delete e.why;
    e.role = got.role;
    e.used_for = got.used_for;
  }
  writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
  console.log(`${id}: ${d.events.length}개 중 ${d.events.length - missing}개 갱신 (${model})`);
  if (missing) console.log(`  누락 ${missing}개 — 직접 채워야 함`);
}
