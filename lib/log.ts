"use client";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { APP_VERSION } from "@/lib/version";

let count = 0;

/** Records an error in Firestore (Settings → Error log) so it can be copied and sent for checking. */
export function logError(where: string, err: unknown, extra?: Record<string, unknown>) {
  const e = err as { message?: string; code?: string; name?: string } | string | undefined;
  const message = typeof e === "string" ? e : [e?.code, e?.message || e?.name].filter(Boolean).join(": ") || String(err);
  console.error(`[${where}]`, err, extra || "");
  if (++count > 40) return; // never flood the log from one session
  let extraText = "";
  try {
    extraText = extra ? JSON.stringify(extra).slice(0, 2000) : "";
  } catch {
    /* ignore */
  }
  void addDoc(collection(db, "logs"), {
    at: Date.now(),
    where,
    message: message.slice(0, 1000),
    extra: extraText,
    page: typeof location !== "undefined" ? location.pathname : "",
    device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    version: APP_VERSION,
  }).catch(() => {});
}
