// 진단 리포트의 AI 해석. 받는 것은 브라우저가 만든 사실표(집계 수치 문장)뿐이다.
// 출력에 사실표에 없는 숫자가 있으면 한 번 되돌려 보내고, 그래도 안 되면 실패로 돌려 규칙 해석을 쓰게 한다.

import { createHash } from "node:crypto";
import { INTERPRET_SYSTEM, validateAiReport, type AiReport } from "@/lib/diagnose/interpret.ts";
import { allowRequest, clientIp, generate, LlmUnavailable, parseJsonObject, unavailableResponse, type Turn } from "@/lib/llm/gemini.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FACTS = 12_000;
const cache = new Map<string, { report: AiReport; model: string }>();

export async function POST(req: Request) {
  let facts: unknown;
  try {
    facts = (await req.json())?.facts;
  } catch {
    return Response.json({ error: "bad_request", message: "요청 형식이 잘못됐습니다" }, { status: 400 });
  }
  if (typeof facts !== "string" || facts.length < 50 || facts.length > MAX_FACTS) {
    return Response.json({ error: "bad_request", message: "사실표가 비었거나 너무 깁니다" }, { status: 400 });
  }

  // 같은 데이터(예: 샘플)는 다시 호출하지 않는다
  const key = createHash("sha256").update(facts).digest("hex");
  const hit = cache.get(key);
  if (hit) return Response.json({ ...hit, cached: true });

  if (!allowRequest("interpret", clientIp(req))) {
    return unavailableResponse(new LlmUnavailable("rate_limited", "잠시 후 다시 시도해 주세요"));
  }

  try {
    const turns: Turn[] = [{ role: "user", text: `사실표:\n${facts}\n\n이 게임의 진단 해석을 작성하라.` }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const { text, model } = await generate({ system: INTERPRET_SYSTEM, turns, temperature: 0.3, maxOutputTokens: 4096 });
      let errors: string[];
      try {
        const v = validateAiReport(parseJsonObject(text), facts);
        if (v.ok) {
          const out = { report: v.report, model };
          if (cache.size > 100) cache.clear();
          cache.set(key, out);
          return Response.json(out);
        }
        errors = v.errors;
      } catch (e) {
        errors = [`JSON으로 읽을 수 없음: ${e instanceof Error ? e.message : ""}`];
      }
      console.warn(`[interpret] attempt ${attempt + 1} rejected: ${errors.join("; ")}`);
      turns.push({ role: "model", text }, { role: "user", text: `위 출력은 다음 이유로 거부됐다.\n- ${errors.join("\n- ")}\n규칙을 지켜 JSON 하나만 다시 출력하라.` });
    }
    throw new LlmUnavailable("bad_output", "AI 해석이 검증을 통과하지 못했습니다");
  } catch (e) {
    return unavailableResponse(e);
  }
}
