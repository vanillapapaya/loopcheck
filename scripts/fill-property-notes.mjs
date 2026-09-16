// 프리셋 컬럼 중 설명(note)이 비어 있는 것만 채운다. 일회성 스크립트.
// 실행: node --env-file=.env.local scripts/fill-property-notes.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, parseJsonObject } from "../lib/llm/gemini.ts";

const dir = join(import.meta.dirname, "../public/presets");
const SYSTEM = `게임 로그 스키마의 컬럼 설명을 쓴다.

- 이 컬럼이 무엇을 담는지 한국어 한 문장. 필요하면 왜 이 값이 필요한지 한 마디 덧붙인다
- 단위와 형식이 중요한 값이면 밝힌다 (초 단위, 0-1 비율, 콤마 구분 목록, UTC 등)
- 이벤트명·컬럼명 같은 식별자는 원문 그대로 쓴다
- 과장어와 이모지를 쓰지 않는다. 120자 이내

입력으로 준 컬럼만, 준 순서대로 채운다. JSON 하나만 출력한다.
{"notes": [{"event": "이벤트명 또는 user_properties", "name": "컬럼명", "note": "설명"}]}`;

for (const id of ["puzzle", "idle", "gacha-rpg", "roguelike"]) {
  const path = join(dir, `${id}.json`);
  const d = JSON.parse(readFileSync(path, "utf8"));
  const missing = [];
  for (const e of d.events) for (const p of e.properties) if (!p.note?.trim()) missing.push({ event: e.name, name: p.name, type: p.type });
  for (const p of d.user_properties) if (!p.note?.trim()) missing.push({ event: "user_properties", name: p.name, type: p.type });
  if (!missing.length) { console.log(`${id}: 빠진 설명 없음`); continue; }

  const { text, model } = await generate({
    system: SYSTEM,
    turns: [{ role: "user", text: JSON.stringify({ game_summary: d.game_summary, 채울_컬럼: missing }, null, 1) }],
    temperature: 0.3,
    maxOutputTokens: 8192,
  });
  const got = new Map((parseJsonObject(text).notes ?? []).map((n) => [`${n.event}|${n.name}`, n.note]));
  let filled = 0;
  const put = (evName, p) => {
    const note = got.get(`${evName}|${p.name}`);
    if (typeof note === "string" && note.trim() && !p.note?.trim()) { p.note = note.trim(); filled++; }
  };
  for (const e of d.events) for (const p of e.properties) put(e.name, p);
  for (const p of d.user_properties) put("user_properties", p);
  writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
  console.log(`${id}: ${missing.length}개 중 ${filled}개 채움 (${model})`);
}
