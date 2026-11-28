import { NextResponse } from "next/server";
import { requireAllowedUser } from "@/lib/verifyToken";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Smart voice": turns a short Hindi/English (Hinglish) voice note into a clean English note,
// and picks out a follow-up date or Hot/Warm/Cold if the speaker says one.
export async function POST(req: Request) {
  try {
    await requireAllowedUser((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const audio = typeof body.audio === "string" ? body.audio : "";
  const todayStr = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  if (!audio || audio.length > 4_000_000) return NextResponse.json({ error: "No recording received, or it was too long." }, { status: 400 });

  const prompt = `This is a short voice note recorded by a food business owner in India about a business contact he just met. The speech may mix Hindi and English (Hinglish) and there may be background noise.
Write what he said as a clear, short note in English (translate Hindi parts). Keep names, company names, products, quantities, prices and numbers exactly as said. Do not add anything he did not say.
Today is ${todayStr}. If he says when to follow up (a date, a day, "next week", "after Diwali" etc.), give that date as followUp in YYYY-MM-DD; otherwise "". If he says the lead is hot, warm or cold (in any language), give interest as "Hot", "Warm" or "Cold"; otherwise "".
Reply with ONLY JSON: {"note":"","followUp":"","interest":""}. If nothing understandable was said, note is "".`;

  const r = await geminiJson([{ text: prompt }, { inline_data: { mime_type: "audio/wav", data: audio } }]);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code, detail: r.detail }, { status: r.status });
  const p = r.json;
  const note = typeof p.note === "string" ? p.note.trim() : "";
  const followUp = typeof p.followUp === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.followUp) ? p.followUp : "";
  const interest = ["Hot", "Warm", "Cold"].includes(p.interest as string) ? (p.interest as string) : "";
  return NextResponse.json({ note, followUp, interest });
}
