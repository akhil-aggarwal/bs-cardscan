import { NextResponse } from "next/server";
import { requireAllowedUser } from "@/lib/verifyToken";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPT = `These are photos of ONE business/visiting card collected at a trade exhibition or business meeting in India. The first image is the front; a second image, if present, is the back. Read every bit of text (any language; transliterate to English where possible) and extract the contact details.
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
  try {
    await requireAllowedUser((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  let images: string[] = [];
  try {
    const body = await req.json();
    images = (Array.isArray(body.images) ? body.images : [])
      .filter((s: unknown): s is string => typeof s === "string" && s.startsWith("data:image/jpeg;base64,"))
      .slice(0, 2);
  } catch {
    /* fall through */
  }
  if (!images.length) return NextResponse.json({ error: "No card photo received." }, { status: 400 });

  const r = await geminiJson([
    { text: PROMPT },
    ...images.map((d) => ({ inline_data: { mime_type: "image/jpeg", data: d.split(",")[1] } })),
  ]);
  if (!r.ok) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });

  const p = r.json;
  const out: Record<string, string> = {};
  for (const k of KEYS) out[k] = typeof p[k] === "string" ? (p[k] as string).trim() : "";
  const phones = p.phones;
  out.phones = Array.isArray(phones) ? phones.filter((x) => typeof x === "string").join(", ") : typeof phones === "string" ? phones : "";
  return NextResponse.json(out);
}
