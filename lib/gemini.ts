// Server-side helper for calling Gemini; keeps the API key off the phone.
//
// Error codes the phone understands (so the card queue knows what to do):
//   daily_limit   – free daily quota used up → wait until it resets
//   minute_limit  – too many requests this minute → wait ~1 minute
//   timeout       – Gemini was slow → try again shortly
//   config        – bad key/model → needs fixing in Vercel, don't retry
//   unreadable    – Gemini answered but not with usable JSON → retry once, then type manually
//   upstream      – any other temporary problem → retry later
export type GeminiCode = "daily_limit" | "minute_limit" | "timeout" | "config" | "unreadable" | "upstream";
export type GeminiResult =
  | { ok: true; json: Record<string, unknown> }
  | { ok: false; status: number; code: GeminiCode; error: string; detail: string };

export const DEFAULT_MODEL = "gemini-3.5-flash-lite"; // free tier: 500 requests/day, 15/minute
const TIMEOUT_MS = 45_000; // answer the phone before Vercel's 60 s limit cuts us off (that was the 504)

async function call(model: string, key: string, parts: unknown[], thinking: boolean) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
          // Reading a card needs no reasoning; minimal thinking keeps answers fast.
          ...(thinking ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function geminiJson(parts: unknown[]): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, status: 500, code: "config", error: "GEMINI_API_KEY is not set in Vercel.", detail: "" };
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  let res: Response;
  try {
    res = await call(model, key, parts, true);
    if (res.status === 400) {
      const body = await res.clone().text().catch(() => "");
      if (/thinking/i.test(body)) res = await call(model, key, parts, false); // model doesn't accept that setting
    }
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return {
      ok: false, status: aborted ? 504 : 502, code: aborted ? "timeout" : "upstream",
      error: aborted ? "Gemini took too long. The card will be tried again." : "Could not reach Gemini. Will try again.",
      detail: String(e).slice(0, 300),
    };
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 600);
    const detail = `Gemini ${res.status} (${model}): ${body}`;
    console.error(detail);
    if (res.status === 429) {
      const daily = /per ?day|PerDay|requests_per_day|RPD|daily/i.test(body);
      return daily
        ? { ok: false, status: 429, code: "daily_limit", error: "Gemini's free daily limit is used up. Cards wait and continue after it resets.", detail }
        : { ok: false, status: 429, code: "minute_limit", error: "Too many cards this minute — continuing shortly.", detail };
    }
    if ([400, 401, 403, 404].includes(res.status)) {
      return { ok: false, status: 502, code: "config", error: "Gemini rejected the request — check GEMINI_API_KEY and GEMINI_MODEL in Vercel.", detail };
    }
    return { ok: false, status: 502, code: "upstream", error: "Gemini had a temporary problem. Will try again.", detail };
  }
  const data = await res.json().catch(() => null);
  const text: string = (data?.candidates?.[0]?.content?.parts || [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text || "")
    .join("");
  try {
    const start = text.indexOf("{");
    return { ok: true, json: JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) };
  } catch {
    return { ok: false, status: 422, code: "unreadable", error: "Gemini's answer could not be read.", detail: `Unparseable reply: ${text.slice(0, 300)}` };
  }
}
