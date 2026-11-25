"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { emptyLead, shrinkImage, waLink, waNumber, type LeadFields as Fields } from "@/lib/leads";
import { newLeadId, useApp } from "@/components/AppProvider";
import Shell from "@/components/Shell";
import LeadFields from "@/components/LeadFields";

type Side = "front" | "back";

export default function ScanPage() {
  const { leads, settings, saveLead, patchLead } = useApp();
  const [files, setFiles] = useState<Record<Side, File | null>>({ front: null, back: null });
  const [form, setForm] = useState<Fields | null>(null);
  const [thumb, setThumb] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean }>({ t: "" });
  const inputs = { front: useRef<HTMLInputElement>(null), back: useRef<HTMLInputElement>(null) };

  const [previews, setPreviews] = useState<Record<Side, string>>({ front: "", back: "" });
  const pick = (side: Side, f: File | null) => {
    setFiles((p) => ({ ...p, [side]: f }));
    setPreviews((p) => {
      if (p[side]) URL.revokeObjectURL(p[side]);
      return { ...p, [side]: f ? URL.createObjectURL(f) : "" };
    });
  };
  const reset = () => {
    pick("front", null);
    pick("back", null);
    setForm(null);
    setThumb("");
    if (inputs.front.current) inputs.front.current.value = "";
    if (inputs.back.current) inputs.back.current.value = "";
  };

  async function read() {
    const list = [files.front, files.back].filter(Boolean) as File[];
    if (!list.length) return;
    setBusy(true);
    setMsg({ t: "Reading the card — usually 5–15 seconds." });
    try {
      const images = await Promise.all(list.map((f) => shrinkImage(f, 1600, 0.85)));
      setThumb(await shrinkImage(list[0], 360, 0.6));
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ images }),
      });
      const data = await res.json().catch(() => ({ error: "Unexpected reply from the server." }));
      if (!res.ok) throw new Error(data.error || "Could not read the card.");
      setForm({ ...emptyLead(), ...data, interest: form?.interest || "", notes: form?.notes || "" });
      setMsg({ t: "Check the details below, add your notes, then save." });
    } catch (e) {
      setMsg({ t: (e as Error).message || "Could not read the card. Try again, or type manually.", err: true });
      if (!form) setForm(emptyLead());
    } finally {
      setBusy(false);
    }
  }

  function save(sentWa: boolean) {
    if (!form) return;
    if (!form.name && !form.company && !form.phones && !form.email) {
      setMsg({ t: "Add at least a name, company, phone or email.", err: true });
      return;
    }
    const now = Date.now();
    void saveLead(newLeadId(), { ...form, stage: sentWa ? "Contacted" : "New", thumb, createdAt: now, updatedAt: now, waSent: sentWa ? now : 0 });
    setMsg({ t: `${form.name || form.company} saved${sentWa ? " — WhatsApp opened." : "."}` });
    reset();
  }

  const link = form ? waLink(form, settings) : "";

  return (
    <Shell>
      <main className="wrap two">
        <section>
          <h2>Scan a visiting card</h2>
          <div className="tiles">
            {(["front", "back"] as Side[]).map((side) => (
              <label key={side} className={"tile" + (files[side] ? " has" : "")}>
                {files[side] && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[side]} alt={`${side} of card`} />
                    <button type="button" className="x" aria-label="Remove photo" onClick={(e) => { e.preventDefault(); pick(side, null); if (inputs[side].current) inputs[side].current!.value = ""; }}>✕</button>
                  </>
                )}
                <span>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></svg>
                  {side === "front" ? "Front of card" : "Back (optional)"}
                </span>
                <input ref={inputs[side]} type="file" accept="image/*" capture="environment" aria-label={`Photo of ${side} of card`} onChange={(e) => pick(side, e.target.files?.[0] || null)} />
              </label>
            ))}
          </div>
          <div className="row">
            <button className="btn pri" disabled={busy || !(files.front || files.back)} onClick={read}>
              {busy ? <><span className="spin" /> Reading…</> : "Read card"}
            </button>
            <button className="btn" onClick={() => setForm(form || emptyLead())}>Type manually</button>
          </div>
          <p className={"status" + (msg.err ? " err" : "")} role="status">{msg.t}</p>

          {form && (
            <form className="panelform" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(false); }}>
              <LeadFields value={form} onChange={setForm} />
              <div className="row">
                <a
                  className="btn wa"
                  href={link || undefined}
                  aria-disabled={!link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { if (!link) { e.preventDefault(); return; } save(true); }}
                >Save &amp; WhatsApp</a>
                <button className="btn pri" type="submit">Save lead</button>
                <button className="btn" type="button" onClick={() => { reset(); setMsg({ t: "" }); }}>Clear</button>
              </div>
              <p className="muted small">{link ? `WhatsApp to +${waNumber(form.whatsapp || form.phones, settings.cc)}` : "Add a phone or WhatsApp number to send a message."}</p>
            </form>
          )}
        </section>

        <section>
          <h2>Recent leads</h2>
          {!leads.length && <div className="empty">No leads yet. Take a photo of a card to start.</div>}
          {leads.slice(0, 5).map((l) => {
            const wl = waLink(l, settings);
            return (
              <div className="lead" key={l.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.thumb ? <img src={l.thumb} alt="" /> : <div className="ph" />}
                <div>
                  <b>{l.name || "(no name)"}{l.interest && <span className={`tag t-${l.interest}`}>{l.interest}</span>}</b>
                  <div className="m">{[l.designation, l.company].filter(Boolean).join(", ")}</div>
                  <div className="m">{[l.phones, l.city].filter(Boolean).join(" · ")}{l.waSent ? " · WhatsApp sent" : ""}</div>
                </div>
                <div className="acts">
                  {wl && <a className="btn wa" href={wl} target="_blank" rel="noopener noreferrer" onClick={() => !l.waSent && void patchLead(l.id, { waSent: Date.now(), stage: l.stage === "New" ? "Contacted" : l.stage })}>WhatsApp</a>}
                  <Link className="btn" href={`/dashboard?edit=${encodeURIComponent(l.id)}`}>Edit</Link>
                </div>
              </div>
            );
          })}
          {leads.length > 0 && <div className="row"><Link className="btn" href="/dashboard">See all leads in the dashboard</Link></div>}
        </section>
      </main>
    </Shell>
  );
}
