"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { auth } from "@/lib/firebase";
import { logError } from "@/lib/log";
import { nextQuotaReset, qAll, qDel, qPut, type QueueItem } from "@/lib/queue";

/**
 * Reads queued cards in the background, one at a time, while the app is open:
 * - waits while offline and starts again when the internet is back
 * - keeps to Gemini's free limits (at most ~13 cards a minute; pauses until the daily reset if the day's quota is used)
 * - retries slow or failed reads a few times before asking you to type the card in
 */
const GAP_MS = 4_600; // ≤ 13 requests a minute (free Flash-Lite allows 15)
const RETRY_MS = [20_000, 60_000, 180_000];
const MAX_TRIES = 4;
const PAUSE_KEY = "queue-pause";

type Pause = { until: number; reason: "daily" | "minute" | "login" | "" };
type Ctx = {
  items: QueueItem[];
  online: boolean;
  pause: Pause;
  add: (i: Omit<QueueItem, "status" | "fields" | "error" | "code" | "attempts" | "nextTryAt">) => Promise<void>;
  remove: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  readyCount: number;
  pendingCount: number;
};
const QueueCtx = createContext<Ctx | null>(null);
export const useQueue = () => {
  const c = useContext(QueueCtx);
  if (!c) throw new Error("useQueue outside provider");
  return c;
};

const readPause = (): Pause => {
  try { const p = JSON.parse(localStorage.getItem(PAUSE_KEY) || "null"); if (p && p.until > Date.now()) return p; } catch { /* ignore */ }
  return { until: 0, reason: "" };
};

export default function QueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const [pause, setPauseState] = useState<Pause>({ until: 0, reason: "" });
  const itemsRef = useRef<QueueItem[]>([]);
  const busy = useRef(false);
  const lastCall = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: QueueItem[]) => { itemsRef.current = next; setItems(next); }, []);
  const save = useCallback(async (it: QueueItem) => {
    commit(itemsRef.current.some((x) => x.id === it.id) ? itemsRef.current.map((x) => (x.id === it.id ? it : x)) : [...itemsRef.current, it]);
    await qPut(it).catch((e) => logError("queue: saving on phone", e));
  }, [commit]);
  const setPause = (p: Pause) => {
    setPauseState(p);
    try { localStorage.setItem(PAUSE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  };

  const tick = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const schedule = (ms: number) => { timer.current = setTimeout(() => void tick(), Math.max(500, ms)); };
    if (busy.current) return;
    if (!navigator.onLine) return; // the "online" event wakes us up
    const p = readPause();
    if (p.until > Date.now()) return schedule(Math.min(p.until - Date.now(), 60_000));
    const now = Date.now();
    const waiting = itemsRef.current.filter((i) => i.status === "waiting");
    const next = waiting.filter((i) => i.nextTryAt <= now)[0];
    if (!next) {
      const soonest = Math.min(...waiting.map((i) => i.nextTryAt));
      if (Number.isFinite(soonest)) schedule(soonest - now);
      return;
    }
    const gap = lastCall.current + GAP_MS - now;
    if (gap > 0) return schedule(gap);

    busy.current = true;
    lastCall.current = Date.now();
    await save({ ...next, status: "reading", error: "" });
    let it: QueueItem = { ...next, status: "reading" };
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        it = { ...it, status: "waiting" };
        setPause({ until: Date.now() + 60_000, reason: "login" });
      } else {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ images: [next.front, next.back].filter(Boolean) }),
        });
        const data = await res.json().catch(() => ({ error: res.status === 504 ? "The server took too long." : "Unexpected reply from the server.", code: res.status === 504 ? "timeout" : "upstream" }));
        if (res.ok) {
          it = { ...it, status: "ready", fields: data, error: "", code: "" };
          setPause({ until: 0, reason: "" });
        } else {
          const code: string = data.code || (res.status === 401 ? "login" : "upstream");
          if (code === "daily_limit") {
            it = { ...it, status: "waiting", error: data.error, code };
            setPause({ until: nextQuotaReset(), reason: "daily" });
            logError("reading card: daily free limit", data.error, { detail: data.detail });
          } else if (code === "minute_limit") {
            it = { ...it, status: "waiting", error: data.error, code };
            setPause({ until: Date.now() + 65_000, reason: "minute" });
          } else if (code === "config") {
            it = { ...it, status: "failed", error: data.error, code };
            logError("reading card: setup problem", data.error, { status: res.status, detail: data.detail });
          } else if (code === "login") {
            it = { ...it, status: "waiting", error: "Waiting for you to sign in again.", code };
            setPause({ until: Date.now() + 60_000, reason: "login" });
          } else {
            const attempts = next.attempts + 1;
            it = attempts >= MAX_TRIES
              ? { ...it, status: "failed", attempts, error: data.error || "Couldn't read this card.", code }
              : { ...it, status: "waiting", attempts, nextTryAt: Date.now() + RETRY_MS[attempts - 1], error: data.error || "", code };
            logError("reading card", data.error, { status: res.status, code, attempt: attempts, detail: data.detail });
          }
        }
      }
    } catch (e) {
      // network dropped mid-request: just wait for the internet again
      it = { ...it, status: "waiting", error: "", nextTryAt: Date.now() + 5_000 };
      if (navigator.onLine) logError("reading card: network", e);
    } finally {
      busy.current = false;
    }
    await save(it);
    schedule(GAP_MS);
  }, [save]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPauseState(readPause());
    qAll()
      .then((all) => commit(all.map((i) => (i.status === "reading" ? { ...i, status: "waiting" as const } : i))))
      .catch((e) => logError("queue: opening phone storage", e))
      .finally(() => void tick());
    const on = () => { setOnline(true); void tick(); };
    const off = () => setOnline(false);
    const vis = () => document.visibilityState === "visible" && void tick();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", vis);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [commit, tick]);

  const value = useMemo<Ctx>(() => ({
    items, online, pause,
    readyCount: items.filter((i) => i.status === "ready" || i.status === "failed").length,
    pendingCount: items.filter((i) => i.status === "waiting" || i.status === "reading").length,
    add: async (i) => {
      await save({ ...i, status: "waiting", fields: null, error: "", code: "", attempts: 0, nextTryAt: 0 });
      void tick();
    },
    remove: async (id) => {
      commit(itemsRef.current.filter((x) => x.id !== id));
      await qDel(id).catch((e) => logError("queue: removing", e));
    },
    retry: async (id) => {
      const it = itemsRef.current.find((x) => x.id === id);
      if (!it) return;
      if (readPause().reason === "minute") setPause({ until: 0, reason: "" });
      await save({ ...it, status: "waiting", attempts: 0, nextTryAt: 0, error: "", code: "" });
      void tick();
    },
  }), [items, online, pause, save, commit, tick]);

  return <QueueCtx.Provider value={value}>{children}</QueueCtx.Provider>;
}
