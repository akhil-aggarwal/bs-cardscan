// Server-side helper for calling Gemini; keeps the API key off the phone.
export type GeminiResult = { ok: true; json: Record<string, unknown> } | { ok: false; status: number; error: string; detail: string };

export async function geminiJson(parts: unknown[]): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, status: 500, error: "GEMINI_API_KEY is not set on the server.", detail: "" };
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });
  } catch (e) {
    return { ok: false, status: 502, error: "Could not reach Gemini. Try again.", detail: String(e).slice(0, 300) };
  }
  if (!res.ok) {
    const detail = `Gemini ${res.status} (${model}): ${(await res.text().catch(() => "")).slice(0, 400)}`;
    console.error(detail);
    const error =
      res.status === 429
        ? "Gemini's free limit was reached for now — wait a minute and try again."
        : res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404
          ? "Gemini rejected the request — check GEMINI_API_KEY and GEMINI_MODEL in Vercel."
          : "Gemini could not answer right now. Try again.";
    return { ok: false, status: 502, error, detail };
  }
  const data = await res.json().catch(() => null);
  const text: string = (data?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  try {
    const start = text.indexOf("{");
    return { ok: true, json: JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) };
  } catch {
    return { ok: false, status: 422, error: "Gemini's answer could not be read. Try again.", detail: `Unparseable reply: ${text.slice(0, 300)}` };
  }
}
