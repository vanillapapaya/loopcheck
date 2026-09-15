// 자유 입력 설계기. 프롬프트 원본 그대로 호출하고, 프리셋과 같은 모양인지 검증한다. 실패 시 1회 재시도.

import { designUserPrompt, DESIGNER_SYSTEM, parseDesignInput, validateDesign } from "@/lib/llm/designer.ts";
import { allowRequest, clientIp, generate, LlmUnavailable, parseJsonObject, unavailableResponse, type Turn } from "@/lib/llm/gemini.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request", message: "요청 형식이 잘못됐습니다" }, { status: 400 });
  }
  const parsed = parseDesignInput(body);
  if (!parsed.ok) return Response.json({ error: "bad_request", message: parsed.message }, { status: 400 });

  if (!allowRequest("design", clientIp(req), 5)) {
    return unavailableResponse(new LlmUnavailable("rate_limited", "잠시 후 다시 시도해 주세요. 그동안 장르 프리셋을 먼저 보셔도 됩니다"));
  }

  try {
    const turns: Turn[] = [{ role: "user", text: designUserPrompt(parsed.input) }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const { text, model } = await generate({ system: DESIGNER_SYSTEM, turns, temperature: 0.5, maxOutputTokens: 16_384, timeoutMs: attempt ? 45_000 : 70_000 });
      let errors: string[];
      try {
        const v = validateDesign(parseJsonObject(text));
        if (v.ok) return Response.json({ result: v.result, model });
        errors = v.errors;
      } catch (e) {
        errors = [`JSON으로 읽을 수 없음: ${e instanceof Error ? e.message : ""}`];
      }
      console.warn(`[design] attempt ${attempt + 1} rejected: ${errors.join("; ")}`);
      turns.push({ role: "model", text }, { role: "user", text: `위 출력은 다음 이유로 거부됐다.\n- ${errors.join("\n- ")}\n출력 형식을 지켜 JSON 하나만 다시 출력하라.` });
    }
    throw new LlmUnavailable("bad_output", "AI 설계 결과가 형식 검증을 통과하지 못했습니다");
  } catch (e) {
    return unavailableResponse(e);
  }
}
