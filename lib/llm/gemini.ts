// Gemini REST 호출. 서버(Route Handler)에서만 쓴다. SDK 없이 fetch 한 번.
// 키가 없거나 한도에 걸리면 LlmUnavailable을 던지고, 호출부는 프리셋·규칙 해석으로 물러난다.

export type LlmErrorCode = "no_key" | "rate_limited" | "timeout" | "upstream" | "bad_output";

export class LlmUnavailable extends Error {
  code: LlmErrorCode;
  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type Turn = { role: "user" | "model"; text: string };

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// 앞의 모델이 없다고(404) 나오면 다음 후보로 넘어간다.
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"];

export function llmConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

export async function generate({
  system, turns, temperature = 0.4, maxOutputTokens = 8192, timeoutMs = 50_000,
}: {
  system: string;
  turns: Turn[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmUnavailable("no_key", "GEMINI_API_KEY가 설정되지 않았습니다");

  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature, maxOutputTokens, responseMimeType: "application/json" },
  });

  const deadline = Date.now() + timeoutMs;
  for (const model of [...new Set(models)]) {
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new LlmUnavailable("timeout", "AI 응답이 제한 시간을 넘었습니다");
      }
      throw new LlmUnavailable("upstream", "AI 서버에 연결하지 못했습니다");
    }
    if (res.status === 404) continue;
    if (res.status === 429) throw new LlmUnavailable("rate_limited", "AI 호출 한도에 걸렸습니다");
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`[gemini] ${model} ${res.status} ${detail}`);
      throw new LlmUnavailable("upstream", `AI 서버 오류 (${res.status})`);
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts ?? [])
      .filter((p: { text?: string; thought?: boolean }) => typeof p.text === "string" && !p.thought)
      .map((p: { text: string }) => p.text)
      .join("");
    if (!text) {
      console.error(`[gemini] ${model} empty output, finishReason=${cand?.finishReason}`);
      throw new LlmUnavailable("bad_output", "AI가 빈 응답을 돌려줬습니다");
    }
    return { text, model };
  }
  throw new LlmUnavailable("upstream", "사용할 수 있는 Gemini 모델을 찾지 못했습니다");
}

/** 코드 펜스나 앞뒤 문장이 붙어 와도 JSON 객체 하나를 꺼낸다. */
export function parseJsonObject(text: string): unknown {
  const s = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("JSON 객체가 없습니다");
  return JSON.parse(s.slice(a, b + 1));
}

// 인스턴스 메모리 기준의 느슨한 호출 제한. 공개 링크에서 키 한도를 한 사람이 다 쓰지 않게 막는 정도.
const hits = new Map<string, number[]>();
export function allowRequest(bucket: string, ip: string, limit = 8, windowMs = 10 * 60_000): boolean {
  const k = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { hits.set(k, recent); return false; }
  recent.push(now);
  hits.set(k, recent);
  if (hits.size > 5_000) hits.clear();
  return true;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function unavailableResponse(e: unknown) {
  if (e instanceof LlmUnavailable) {
    return Response.json({ error: e.code, message: e.message }, { status: e.code === "rate_limited" ? 429 : 503 });
  }
  console.error("[llm]", e);
  return Response.json({ error: "upstream", message: "AI 처리 중 문제가 생겼습니다" }, { status: 503 });
}
