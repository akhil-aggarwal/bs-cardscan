"use client";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { logError } from "@/lib/log";

/** Settings → Card photos: keep them online, or delete them once each card is checked. */
export default function PhotoSettings() {
  const { settings, saveSettings, countPhotos, deleteAllPhotos } = useApp();
  const [count, setCount] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = () => countPhotos().then(setCount).catch(() => setCount(null));
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section id="photos">
      <h2>Card photos</h2>
      <p className="muted">Photos let you check what the AI read. Each card with photos uses about 300 KB of Firebase&apos;s free 1 GB (about 3,000 cards). Without photos it&apos;s about 25 KB (a small thumbnail stays), so roughly 39,000 cards.</p>
      <div className="exlist">
        <label className="exrow check">
          <input type="radio" name="keepphotos" checked={settings.keepPhotos} onChange={() => void saveSettings({ ...settings, keepPhotos: true })} />
          <span><b>Keep photos online</b><span className="m" style={{ display: "block" }}>See the photo later from any device, e.g. when a number looks wrong weeks later.</span></span>
        </label>
        <label className="exrow check">
          <input type="radio" name="keepphotos" checked={!settings.keepPhotos} onChange={() => void saveSettings({ ...settings, keepPhotos: false })} />
          <span><b>Delete photos once I&apos;ve checked and saved the card</b><span className="m" style={{ display: "block" }}>Photos are used only on this phone while you check, then removed.</span></span>
        </label>
      </div>
      <p className="status">{count === null ? "" : count === 0 ? "No photos are stored online." : `${count} card${count === 1 ? " has" : "s have"} photos stored online (about ${Math.max(1, Math.round((count * 300) / 1024))} MB).`}</p>
      {count !== null && count > 0 && (
        <div className="row">
          {confirm ? (
            <>
              <button className="btn danger" disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  const n = await deleteAllPhotos();
                  setNote(`Deleted photos from ${n} card${n === 1 ? "" : "s"}. Card details and thumbnails are kept.`);
                } catch (e) {
                  logError("deleting all photos", e);
                  setNote("Couldn't finish deleting — check your internet and try again.");
                }
                setBusy(false); setConfirm(false); void refresh();
              }}>{busy ? "Deleting…" : `Yes, delete all ${count} photos`}</button>
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn danger-txt" onClick={() => { setNote(""); setConfirm(true); }}>Delete all saved photos…</button>
          )}
        </div>
      )}
      {confirm && <p className="m">Photos can&apos;t be brought back. Card details, notes and thumbnails stay.</p>}
      {note && <p className="status">{note}</p>}
    </section>
  );
}
