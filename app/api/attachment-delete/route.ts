import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAllowedUser } from "@/lib/verifyToken";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAllowedUser((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const { url } = await req.json().catch(() => ({ url: "" }));
  if (typeof url !== "string" || !/^https:\/\/[a-z0-9]+\.(public|private)\.blob\.vercel-storage\.com\//i.test(url)) {
    return NextResponse.json({ error: "Not a stored file." }, { status: 400 });
  }
  try {
    await del(url);
  } catch {
    /* already gone — fine */
  }
  return NextResponse.json({ ok: true });
}
