"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { logError } from "@/lib/log";
import { effectiveEx, exName, lastVisit, waLink } from "@/lib/leads";
import { compress, type QueueItem } from "@/lib/queue";
import { newLeadId, useApp } from "@/components/AppProvider";
import { useQueue } from "@/components/QueueProvider";
import Shell from "@/components/Shell";
import ReviewSheet from "@/components/ReviewSheet";
import { useFileShare } from "@/components/useFileShare";

type Side = "front" | "back";
const CamIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const GalIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></svg>
);
const timeIST = (ts: number) => new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function statusText(i: QueueItem, online: boolean, pause: { until: number; reason: string }) {
  if (i.status === "ready") return { t: "Ready to check", c: "ok" };
  if (i.status === "failed") return { t: "Couldn't read — tap to type it in", c: "bad" };
  if (i.status === "reading") return { t: "Reading…", c: "busy" };
  if (!online) return { t: "Waiting for internet", c: "wait" };
  if (pause.until > Date.now()) {
    if (pause.reason === "daily") return { t: `Free daily limit used — continues at ${timeIST(pause.until)}`, c: "wait" };
    if (pause.reason === "login") return { t: "Waiting for sign-in", c: "wait" };
    return { t: "In line (pacing to stay free)", c: "wait" };
  }
  if (i.attempts > 0) return { t: `Retrying soon (try ${i.attempts + 1})`, c: "wait" };
  return { t: "In line", c: "wait" };
}

export default function ScanPage() {
  const { leads, settings, patchLead } = useApp();
  const q = useQueue();
  const ex = effectiveEx(settings);
  const [files, setFiles] = useState<Record<Side, File | null>>({ front: null, back: null });
  const [previews, setPreviews] = useState<Record<Side, string>>({ front: "", back: "" });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean }>({ t: "" });
  const [open, setOpen] = useState<string | null>(null); // queue id, or "manual"
  const { canShare, share } = useFileShare(settings);
  const inputs = useRef<HTMLInputElement[]>([]);

  const pick = (side: Side, f: File | null) => {
    setFiles((p) => ({ ...p, [side]: f }));
    setPreviews((p) => {
      if (p[side]) URL.revokeObjectURL(p[side]);
      return { ...p, [side]: f ? URL.createObjectURL(f) : "" };
    });
  };
  const onFiles = (side: Side, list: FileList | null) => {
    const arr = Array.from(list || []).filter((f) => f.type.startsWith("image/") || !f.type);
    if (!arr.length) return;
    if (arr.length >= 2) { pick("front", arr[0]); pick("back", arr[1]); } else pick(side, arr[0]);
  };
  const clearTiles = () => { pick("front", null); pick("back", null); inputs.current.forEach((i) => i && (i.value = "")); };

  async function addCard() {
    const f = files.front || files.back;
    if (!f) return;
    setAdding(true);
    try {
      // ~150 KB per side: sharp enough to read and check, small enough that Firebase's free 1 GB holds thousands of cards
      const front = await compress(f, 1280, 150_000);
      const back = files.front && files.back ? await compress(files.back, 1280, 150_000) : "";
      const thumb = await compress(f, 360, 25_000);
      await q.add({ id: newLeadId(), createdAt: Date.now(), ex, front, back, thumb });
      clearTiles();
      const n = q.items.length + 1;
      setMsg({ t: navigator.onLine ? `Card added (${n} in queue). Reading in the background — take the next card.` : `Card saved on this phone (${n} in queue). It will be read when you're back online.` });
    } catch (e) {
      logError("adding card to queue", e);
      setMsg({ t: "Couldn't save that photo on the phone. Try again, or free up some storage.", err: true });
    } finally {
      setAdding(false);
    }
  }

  const sorted = [...q.items].sort((a, b) => {
    const rank = (i: QueueItem) => (i.status === "ready" ? 0 : i.status === "failed" ? 1 : 2);
    return rank(a) - rank(b) || a.createdAt - b.createdAt;
  });
  const openItem = q.items.find((i) => i.id === open) || null;
  const nextReady = (skip: string) => sorted.find((i) => i.id !== skip && (i.status === "ready" || i.status === "failed"));

  return (
    <Shell>
      <main className="wrap two">
        <section>
          <h2>Scan visiting cards</h2>
          <p className="exbar">Saving to <b>{exName(ex, settings)}</b> · <Link href="/settings#exhibitions">change</Link></p>
          <div className="tiles">
            {(["front", "back"] as Side[]).map((side, i) => (
              <div key={side} className={"tile" + (files[side] ? " has" : "")}>
                {files[side] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[side]} alt={`${side} of card`} />
                    <button type="button" className="x" aria-label="Remove photo" onClick={() => pick(side, null)}>✕</button>
                  </>
                ) : (
                  <div className="tile-in">
                    <b>{side === "front" ? "Front of card" : "Back (optional)"}</b>
                    <label className="tbtn"><CamIcon /> Camera
                      <input ref={(el) => { if (el) inputs.current[i * 2] = el; }} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(side, e.target.files)} />
                    </label>
                    <label className="tbtn"><GalIcon /> Gallery
                      <input ref={(el) => { if (el) inputs.current[i * 2 + 1] = el; }} type="file" accept="image/*" multiple={side === "front"} hidden onChange={(e) => onFiles(side, e.target.files)} />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="row">
            <button className="btn pri" disabled={adding || !(files.front || files.back)} onClick={addCard}>
              {adding ? <><span className="spin" /> Saving…</> : "Add card → next"}
            </button>
            <button className="btn" onClick={() => setOpen("manual")}>Type manually</button>
          </div>
          <p className={"status" + (msg.err ? " err" : "")} role="status">{msg.t || "Photograph the front (and back), tap Add card, and carry on with the next one. Cards are read in the background."}</p>
          {!q.online && <p className="offline-note">You&apos;re offline. Keep scanning — cards are kept on this phone and read automatically when the internet is back (with the app open).</p>}

          <div className="qhead">
            <h2>Cards to check {q.readyCount > 0 && <span className="pill">{q.readyCount}</span>}</h2>
            {q.pendingCount > 0 && <span className="m">{q.pendingCount} still being read</span>}
          </div>
          {!q.items.length && <div className="empty">No cards waiting. Scanned cards appear here to check and save.</div>}
          <div className="qlist">
            {sorted.map((i) => {
              const st = statusText(i, q.online, q.pause);
              const clickable = i.status === "ready" || i.status === "failed";
              return (
                <div key={i.id} className={"qitem " + st.c}>
                  <button type="button" className="qmain" disabled={!clickable} onClick={() => setOpen(i.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.thumb} alt="" />
                    <span>
                      <b>{i.fields?.name || i.fields?.company || (i.status === "ready" ? "(no name read)" : "New card")}</b>
                      {i.fields?.company && i.fields?.name && <span className="m"> · {i.fields.company}</span>}
                      <span className={"qst " + st.c}>{st.c === "busy" && <span className="spin dark" />}{st.t}</span>
                    </span>
                  </button>
                  {clickable
                    ? <button type="button" className="btn pri" onClick={() => setOpen(i.id)}>Check</button>
                    : <button type="button" className="btn danger-txt" onClick={() => void q.remove(i.id)} aria-label="Remove from queue">✕</button>}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2>Recent cards</h2>
          {!leads.length && <div className="empty">No saved cards yet.</div>}
          {leads.slice(0, 5).map((l) => {
            const wl = waLink(l, settings);
            const lv = lastVisit(l, settings);
            return (
              <div className="lead" key={l.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.thumb ? <img src={l.thumb} alt="" /> : <div className="ph" />}
                <div>
                  <b>{l.name || "(no name)"}<span className={`tag k-${l.kind}`}>{l.kind}</span>{l.interest && <span className={`tag t-${l.interest}`}>{l.interest}</span>}</b>
                  <div className="m">{[l.designation, l.company].filter(Boolean).join(", ")}</div>
                  <div className="m">{lv.label}{lv.more ? ` (+${lv.more} earlier)` : ""}{l.waSent ? " · WhatsApp sent" : ""}</div>
                </div>
                <div className="acts">
                  {wl && <a className="btn wa" href={wl} target="_blank" rel="noopener noreferrer" onClick={() => !l.waSent && void patchLead(l.id, { waSent: Date.now(), stage: l.stage === "New" ? "Contacted" : l.stage })}>WhatsApp</a>}
                  {canShare && l.kind === "Buyer" && <button className="btn wa-out" onClick={() => void share(l).then((ok) => { if (ok && !l.waSent) void patchLead(l.id, { waSent: Date.now(), stage: l.stage === "New" ? "Contacted" : l.stage }); })}>Send PDF</button>}
                  <Link className="btn" href={`/dashboard?edit=${encodeURIComponent(l.id)}`}>Edit</Link>
                </div>
              </div>
            );
          })}
          {leads.length > 0 && <div className="row"><Link className="btn" href="/dashboard">See all cards in the dashboard</Link></div>}
        </section>
      </main>

      {open && (open === "manual" || openItem) && (
        <ReviewSheet
          key={open}
          item={open === "manual" ? null : openItem}
          ex={ex}
          onClose={() => setOpen(null)}
          onSaved={(m) => {
            setMsg({ t: m });
            const nx = open === "manual" ? null : nextReady(open);
            setOpen(nx ? nx.id : null); // straight on to the next card to check
          }}
        />
      )}
    </Shell>
  );
}
