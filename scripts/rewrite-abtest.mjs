// 프리셋의 첫 검증 설계를 A/B 전제에서 이중차분 전제로 바꾼다. 일회성 스크립트.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, parseJsonObject } from "../lib/llm/gemini.ts";

const dir = join(import.meta.dirname, "../public/presets");
const SYSTEM = `게임 지표 설계서의 "첫 검증 설계"를 다시 쓴다.

A/B 테스트를 전제하지 마라. 게임에서 유저마다 난이도·가격·보상을 다르게 주는 것은 형평성 문제이고,
소규모 팀의 유입으로는 표본도 모자란다. 변경은 전원에게 같게 적용하고, 그 변경에 더 노출되는 집단과
덜 노출되는 집단의 변화량 차이로 효과를 읽는 설계로 쓴다(이중차분).

입력으로 기존 설계와 이 게임의 핵심 루프, 이벤트 목록, KPI를 준다. 가설과 1차 지표는 유지하되 필요하면 다듬는다.

- unit: 비교 방식. 전원에게 무엇을 적용하고, 이 게임의 루프 안에서 어느 집단이 영향을 더 받고 어느 집단을 비교군으로 둘지.
  두 집단은 실제로 구분되는 것으로 고른다. 유입이 충분한 팀이면 무작위 배정도 가능하다는 단서를 한 문장 덧붙인다
- min_duration_days: 변경 후 관측 일수 (숫자)
- sample_size_note: 변경 전 며칠을 먼저 관측할지, 두 집단의 격차가 일정했는지 어떻게 확인할지(평행 추세),
  표본이 모자랄 때 대신 볼 지표
- guardrail_metrics: 악화되면 되돌려야 할 지표

한국어 서술형. 과장어와 이모지를 쓰지 않는다. JSON 하나만 출력한다.
{"ab_test": {"hypothesis": "...", "primary_metric": "...", "guardrail_metrics": ["..."], "unit": "...", "min_duration_days": 7, "sample_size_note": "..."}}`;

for (const id of ["puzzle", "idle", "gacha-rpg", "roguelike"]) {
  const path = join(dir, `${id}.json`);
  const d = JSON.parse(readFileSync(path, "utf8"));
  const { text, model } = await generate({
    system: SYSTEM,
    turns: [{ role: "user", text: JSON.stringify({ game_summary: d.game_summary, events: d.events.map((e) => e.name), kpis: d.kpis.map((k) => k.name), 기존_설계: d.ab_test }, null, 1) }],
    temperature: 0.3,
  });
  const out = parseJsonObject(text).ab_test;
  const ok = out && ["hypothesis", "primary_metric", "unit", "sample_size_note"].every((k) => typeof out[k] === "string" && out[k].length > 10)
    && Array.isArray(out.guardrail_metrics) && out.guardrail_metrics.length && typeof out.min_duration_days === "number";
  if (!ok) { console.log(`${id}: 형식 미달로 건너뜀`); continue; }
  d.ab_test = out;
  writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
  console.log(`${id}: 갱신 (${model})\n  비교 방식: ${out.unit.slice(0, 110)}`);
}
