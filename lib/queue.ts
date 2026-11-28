"use client";
// Cards waiting to be read, kept on the phone (IndexedDB) so nothing is lost offline or if the app closes.

export type QueueStatus = "waiting" | "reading" | "ready" | "failed";
export type QueueItem = {
  id: string;
  createdAt: number;
  ex: string; // exhibition at the moment the photo was taken
  front: string; // jpeg data URL (also what gets stored with the saved card)
  back: string; // "" if no back photo
  thumb: string; // small jpeg data URL for lists
  status: QueueStatus;
  fields: Record<string, string> | null; // what Gemini read
  error: string;
  code: string;
  attempts: number;
  nextTryAt: number;
};

const DB = "card-scanner";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req ? (req.result as T) : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error || new Error("Storage aborted — the phone may be low on space.")); };
  });
}

export const qAll = async () => ((await tx<QueueItem[]>("readonly", (s) => s.getAll())) || []).sort((a, b) => a.createdAt - b.createdAt);
export const qPut = (item: QueueItem) => tx("readwrite", (s) => s.put(item));
export const qDel = (id: string) => tx("readwrite", (s) => s.delete(id));

/** When Gemini's free daily quota starts again: midnight Pacific time (about 1:30 pm in India). */
export function nextQuotaReset(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const off = /GMT([+-]\d+)/.exec(get("timeZoneName"))?.[1] || "-8";
  const y = +get("year"), m = +get("month"), d = +get("day");
  // midnight of the next Pacific day, expressed in UTC, plus a 2-minute cushion
  return Date.UTC(y, m - 1, d + 1, 0, 0, 0) - Number(off) * 3600_000 + 120_000;
}

/** Shrinks a photo to a JPEG data URL that fits a byte budget (keeps uploads quick and Firestore happy). */
export function compress(file: Blob, maxDim: number, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let dim = maxDim, q = 0.82, out = "";
      for (let i = 0; i < 6; i++) {
        const k = Math.min(1, dim / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", q);
        if (out.length * 0.75 <= maxBytes) break;
        q = Math.max(0.5, q - 0.1);
        if (q === 0.5) dim = Math.round(dim * 0.85);
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not open that photo")); };
    img.src = url;
  });
}
