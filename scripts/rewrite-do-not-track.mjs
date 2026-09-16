// 프리셋의 do_not_track 문장을 존댓말 서술형으로 바꾼다. 일회성 스크립트.
// 실행: node --env-file=.env.local scripts/rewrite-do-not-track.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, parseJsonObject } from "../lib/llm/gemini.ts";

const dir = join(import.meta.dirname, "../public/presets");
const SYSTEM = `게임 지표 설계서의 "지금은 찍지 마세요" 항목을 다듬는다.

- 내용은 그대로 두고 문체만 바꾼다. 항목 수와 순서를 유지한다
- 팀에게 직접 말하는 자리이므로 존댓말 서술형으로 쓴다 (~하세요, ~입니다, ~습니다)
- 무엇을 찍지 말라는 것인지 먼저 말하고, 이유를 뒤에 붙인다. 한두 문장
- 이벤트명·컬럼명 같은 코드 식별자는 원문 그대로 둔다
- 과장어와 이모지를 쓰지 않는다

JSON 하나만 출력한다. {"do_not_track": ["...", "..."]}`;

for (const id of ["puzzle", "idle", "gacha-rpg", "roguelike"]) {
  const path = join(dir, `${id}.json`);
  const d = JSON.parse(readFileSync(path, "utf8"));
  const { text, model } = await generate({
    system: SYSTEM,
    turns: [{ role: "user", text: JSON.stringify({ do_not_track: d.do_not_track }, null, 1) }],
    temperature: 0.3,
  });
  const out = parseJsonObject(text);
  if (!Array.isArray(out.do_not_track) || out.do_not_track.length !== d.do_not_track.length) {
    console.log(`${id}: 항목 수가 달라 건너뜀 (${out.do_not_track?.length} vs ${d.do_not_track.length})`);
    continue;
  }
  d.do_not_track = out.do_not_track;
  writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
  console.log(`${id}: ${d.do_not_track.length}개 갱신 (${model})`);
}
