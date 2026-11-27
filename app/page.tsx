"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { logError } from "@/lib/log";
import {
  effectiveEx, emptyLead, exName, findDuplicate, fmtDay, lastVisit, mergeInto, sameCompany, shrinkImage, waLink, waNumber,
  type Lead, type LeadFields as Fields,
} from "@/lib/leads";
import { newLeadId, useApp } from "@/components/AppProvider";
import Shell from "@/components/Shell";
import LeadFields from "@/components/LeadFields";
import { useFileShare } from "@/components/useFileShare";

type Side = "front" | "back";
const CamIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const GalIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></svg>
);

export default function ScanPage() {
  const { leads, settings, saveLead, patchLead } = useApp();
  const ex = effectiveEx(settings);
  const [files, setFiles] = useState<Record<Side, File | null>>({ front: null, back: null });
  const [previews, setPreviews] = useState<Record<Side, string>>({ front: "", back: "" });
  const [form, setForm] = useState<Fields | null>(null);
  const [thumb, setThumb] = useState("");
  const [busy, setBusy] = useState(false);
  const [forceNew, setForceNew] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean }>({ t: "" });
  const { canShare, share } = useFileShare(settings);
  const inputs = useRef<HTMLInputElement[]>([]);

  const pick = (side: Side, f: File | null) => {
    setFiles((p) => ({ ...p, [side]: f }));
    setPreviews((p) => {
      if (p[side]) URL.revokeObjectURL(p[side]);
      return { ...p, [side]: f ? URL.createObjectURL(f) : "" };
    });
  };
  // From the gallery you can pick two photos at once: first = front, second = back.
  const onFiles = (side: Side, list: FileList | null) => {
    const arr = Array.from(list || []).filter((f) => f.type.startsWith("image/") || !f.type);
    if (!arr.length) return;
    if (arr.length >= 2) { pick("front", arr[0]); pick("back", arr[1]); }
    else pick(side, arr[0]);
  };
  const reset = () => {
    pick("front", null);
    pick("back", null);
    setForm(null);
    setThumb("");
    setForceNew(false);
    inputs.current.forEach((i) => i && (i.value = ""));
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
      if (!res.ok) {
        logError("reading card", data.error, { status: res.status, detail: data.detail });
        throw new Error(data.error || "Could not read the card.");
      }
      const base = form || emptyLead(ex);
      setForm({ ...base, ...data, kind: base.kind, interest: base.interest, notes: base.notes, followUp: base.followUp, visits: base.visits });
      setForceNew(false);
      setMsg({ t: "Check the details below, add your notes, then save." });
    } catch (e) {
      if (!(e instanceof Error) || !e.message) logError("reading card", e);
      setMsg({ t: (e as Error).message || "Could not read the card. Try again, or type manually.", err: true });
      if (!form) setForm(emptyLead(ex));
    } finally {
      setBusy(false);
    }
  }

  const dup = useMemo(() => (form && !forceNew ? findDuplicate(form, leads) : null), [form, leads, forceNew]);
  const colleagues = useMemo(() => (form ? sameCompany(form.company, leads, dup?.lead.id) : []), [form, leads, dup]);

  const valid = () => {
    if (form && (form.name || form.company || form.phones || form.email)) return true;
    setMsg({ t: "Add at least a name, company, phone or email.", err: true });
    return false;
  };

  function saveNew(sentWa: boolean) {
    if (!form || !valid()) return;
    const now = Date.now();
    const visits = form.visits.length ? form.visits.map((v) => ({ ...v, at: now })) : [{ ex, at: now }];
    void saveLead(newLeadId(), { ...form, visits, stage: sentWa && form.stage === "New" ? "Contacted" : form.stage, thumb, createdAt: now, updatedAt: now, waSent: sentWa ? now : 0 });
    setMsg({ t: `${form.name || form.company} saved${sentWa ? " — WhatsApp opened." : "."}` });
    reset();
  }

  function updateExisting(old: Lead, sentWa: boolean) {
    if (!form) return;
    const ch = mergeInto(old, form, form.visits[0]?.ex ?? ex);
    if (thumb && !old.thumb) ch.thumb = thumb;
    if (sentWa) { ch.waSent = Date.now(); if (old.stage === "New") ch.stage = "Contacted"; }
    void patchLead(old.id, ch);
    setMsg({ t: `${old.name || old.company} updated${ch.visits ? " — this meeting was added" : ""}${sentWa ? ", WhatsApp opened" : ""}.` });
    reset();
  }

  const save = (sentWa: boolean) => (dup ? updateExisting(dup.lead, sentWa) : saveNew(sentWa));
  const link = form ? waLink(form, settings) : "";
  const showPdf = canShare && form?.kind !== "Vendor";

  return (
    <Shell>
      <main className="wrap two">
        <section>
          <h2>Scan a visiting card</h2>
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
          <p className="muted small">Tip: in Gallery you can select the front and back together.</p>
          <div className="row">
            <button className="btn pri" disabled={busy || !(files.front || files.back)} onClick={read}>
              {busy ? <><span className="spin" /> Reading…</> : "Read card"}
            </button>
            <button className="btn" onClick={() => setForm(form || emptyLead(ex))}>Type manually</button>
          </div>
          <p className={"status" + (msg.err ? " err" : "")} role="status">{msg.t}</p>

          {form && (
            <form className="panelform" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(false); }}>
              {dup && (
                <div className="dup" role="alert">
                  <b>Already saved — {dup.reason}</b>
                  <div className="dup-who">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {dup.lead.thumb ? <img src={dup.lead.thumb} alt="" /> : null}
                    <div>
                      <div>{dup.lead.name || "(no name)"}{dup.lead.company ? `, ${dup.lead.company}` : ""}</div>
                      <div className="m">First met: {exName(dup.lead.visits[0]?.ex || "", settings)} · {fmtDay(dup.lead.visits[0]?.at || dup.lead.createdAt)}{dup.lead.visits.length > 1 ? ` · met ${dup.lead.visits.length} times` : ""}</div>
                    </div>
                  </div>
                  <p className="m">Saving will <b>update this person</b>: blank details get filled, new numbers and notes are added, and today&apos;s meeting is recorded.</p>
                  <div className="acts">
                    <Link className="btn" href={`/dashboard?edit=${encodeURIComponent(dup.lead.id)}`}>Open existing</Link>
                    <button type="button" className="btn" onClick={() => setForceNew(true)}>It&apos;s a different person</button>
                  </div>
                </div>
              )}
              {!dup && colleagues.length > 0 && (
                <p className="cohint">Also from <b>{form.company}</b>: {colleagues.slice(0, 3).map((c) => [c.name || "(no name)", c.designation].filter(Boolean).join(" – ")).join("; ")}{colleagues.length > 3 ? ` and ${colleagues.length - 3} more` : ""}. They&apos;ll be grouped together.</p>
              )}
              <LeadFields value={form} onChange={setForm} settings={settings} />
              <div className="row">
                <a
                  className="btn wa"
                  href={link || undefined}
                  aria-disabled={!link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { if (!link || !valid()) { e.preventDefault(); return; } save(true); }}
                >{dup ? "Update & WhatsApp" : "Save & WhatsApp"}</a>
                {showPdf && (
                  <button className="btn wa-out" type="button" onClick={() => {
                    if (!valid()) return;
                    void share(form).then((ok) => { if (ok) save(true); });
                  }}>Send PDF</button>
                )}
                <button className="btn pri" type="submit">{dup ? `Update ${dup.lead.name.split(" ")[0] || "existing"}` : "Save lead"}</button>
                <button className="btn" type="button" onClick={() => { reset(); setMsg({ t: "" }); }}>Clear</button>
              </div>
              <p className="muted small">{link ? `WhatsApp to +${waNumber(form.whatsapp || form.phones, settings.cc)} · ${form.kind === "Vendor" ? "vendor" : "buyer"} message` : "Add a phone or WhatsApp number to send a message."}</p>
            </form>
          )}
        </section>

        <section>
          <h2>Recent cards</h2>
          {!leads.length && <div className="empty">No cards yet. Take a photo of a card to start.</div>}
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
    </Shell>
  );
}
