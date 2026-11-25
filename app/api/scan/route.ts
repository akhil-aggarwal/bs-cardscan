import { NextResponse } from "next/server";
import { allowedEmails, verifyFirebaseToken } from "@/lib/verifyToken";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPT = `These are photos of ONE business/visiting card collected at Indusfood, a food & beverage trade fair in India. The first image is the front; a second image, if present, is the back. Read every bit of text (any language; transliterate to English where possible) and extract the contact details.
Reply with ONLY a JSON object with exactly these keys:
{"name":"","designation":"","company":"","phones":["+91 98765 43210"],"whatsapp":"","email":"","website":"","address":"","city":"","country":"","gst":"","products":""}
Rules:
- phones: every phone/mobile number printed, in international format with + and country code when the card's address, country or prefix makes it clear; Indian 10-digit mobiles get +91. Leave out fax numbers.
- whatsapp: the number marked WhatsApp if any; otherwise the first mobile number; otherwise "".
- products: a short phrase of what the company deals in, only if the card says so.
- If there are several people or emails, keep them all in the field separated by ", ".
- Use "" for anything not on the card. Never invent details.`;

const KEYS = ["name", "designation", "company", "whatsapp", "email", "website", "address", "city", "country", "gst", "products"] as const;

export async function POST(req: Request) {
  // 1. Only signed-in, allowed users may spend your Gemini quota.
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const { email } = await verifyFirebaseToken(token);
    const allow = allowedEmails();
    if (allow.length && !allow.includes(email)) {
      return NextResponse.json({ error: "This account is not allowed to use the scanner." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Your login has expired. Please sign in again." }, { status: 401 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "GEMINI_API_KEY is not set on the server." }, { status: 500 });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  // 2. Images arrive as JPEG data URLs (already shrunk on the phone).
  let images: string[] = [];
  try {
    const body = await req.json();
    images = (Array.isArray(body.images) ? body.images : []).filter(
      (s: unknown): s is string => typeof s === "string" && s.startsWith("data:image/jpeg;base64,"),
    ).slice(0, 2);
  } catch {
    /* fall through */
  }
  if (!images.length) return NextResponse.json({ error: "No card photo received." }, { status: 400 });

  const parts = [
    { text: PROMPT },
    ...images.map((d) => ({ inline_data: { mime_type: "image/jpeg", data: d.split(",")[1] } })),
  ];

  // 3. Ask Gemini for JSON.
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Gemini error", res.status, detail.slice(0, 500));
    const msg =
      res.status === 429
        ? "Gemini's free limit was reached for now — wait a minute and try again."
        : res.status === 400 || res.status === 403
          ? "Gemini rejected the request — check GEMINI_API_KEY and GEMINI_MODEL."
          : "Gemini could not read the card right now. Try again.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  let parsed: Record<string, unknown> = {};
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return NextResponse.json({ error: "Could not make out the card. Retake the photo, or type manually." }, { status: 422 });
  }

  // 4. Return only clean string fields.
  const out: Record<string, string> = {};
  for (const k of KEYS) out[k] = typeof parsed[k] === "string" ? (parsed[k] as string).trim() : "";
  const phones = parsed.phones;
  out.phones = Array.isArray(phones) ? phones.filter((p) => typeof p === "string").join(", ") : typeof phones === "string" ? phones : "";
  return NextResponse.json(out);
}
