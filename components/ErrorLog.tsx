"use client";
import { useEffect, useState } from "react";
import { collection, deleteDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { APP_VERSION } from "@/lib/version";

type Entry = { id: string; at: number; where: string; message: string; extra: string; page: string; device: string; online: boolean; version: string };

const KEEP_DAYS = 30;
const fmt = (ts: number) => new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Settings → Error log: shows recent errors and lets you copy or download them to send for checking. */
export default function ErrorLog() {
  const [items, setItems] = useState<Entry[] | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      // Tidy up first: drop entries older than 30 days.
      const old = await getDocs(query(collection(db, "logs"), where("at", "<", Date.now() - KEEP_DAYS * 864e5), limit(100)));
      await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));
      const snap = await getDocs(query(collection(db, "logs"), orderBy("at", "desc"), limit(200)));
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Entry, "id">) })));
    } catch (e) {
      setItems([]);
      setNote("Couldn't load the log: " + ((e as Error).message || "check your internet") + ". If it says 'permission', update the Firestore rules (see setup notes).");
    }
  }
  useEffect(() => { void load(); }, []);

  const text = () =>
    [`Card Scanner error log — app v${APP_VERSION} — copied ${new Date().toLocaleString("en-IN")}`, `${items?.length || 0} entries, newest first`, "",
      ...(items || []).map((e) =>
        `[${fmt(e.at)}] ${e.where}: ${e.message}${e.extra ? `\n    details: ${e.extra}` : ""}\n    page ${e.page || "?"} · ${e.online === false ? "OFFLINE" : "online"} · v${e.version || "?"} · ${e.device || ""}`),
    ].join("\n");

  async function copy() {
    try { await navigator.clipboard.writeText(text()); setNote("Copied. Paste it into your chat with Claude."); }
    catch { setNote("Copy was blocked — use Download instead."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text()], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-scanner-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function clearAll() {
    try {
      const snap = await getDocs(query(collection(db, "logs"), limit(500)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      setItems([]);
      setNote("Log cleared.");
    } catch {
      setNote("Couldn't clear the log. Try again.");
    }
  }

  return (
    <section>
      <h2>Error log</h2>
      <p className="muted">Problems the app ran into, for example a card that couldn&apos;t be read or a save that failed. If something goes wrong, tap <b>Copy</b> and send it to Claude. Entries older than {KEEP_DAYS} days are removed by themselves.</p>
      <div className="row">
        <button className="btn pri" onClick={copy} disabled={!items?.length}>Copy log</button>
        <button className="btn" onClick={download} disabled={!items?.length}>Download .txt</button>
        <button className="btn" onClick={() => void load()}>Refresh</button>
        <button className="btn danger-txt" onClick={() => void clearAll()} disabled={!items?.length}>Clear</button>
      </div>
      <p className="status" role="status">{note || (items === null ? "Loading…" : items.length ? `${items.length} entr${items.length === 1 ? "y" : "ies"}.` : "No errors recorded. 👍")}</p>
      {!!items?.length && (
        <>
          <button className="btn" onClick={() => setOpen(!open)}>{open ? "Hide entries" : "Show entries"}</button>
          {open && (
            <ul className="log">
              {items.slice(0, 50).map((e) => (
                <li key={e.id}><span className="m">{fmt(e.at)} · {e.where}</span><div>{e.message}</div></li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
