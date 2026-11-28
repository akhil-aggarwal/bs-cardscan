"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { emptyLead, exName, findDuplicate, fmtDay, mergeInto, sameCompany, waLink, waNumber, type Lead, type LeadFields as Fields } from "@/lib/leads";
import type { QueueItem } from "@/lib/queue";
import { newLeadId, useApp } from "./AppProvider";
import { useQueue } from "./QueueProvider";
import LeadFields from "./LeadFields";
import PhotoPanel from "./PhotoPanel";
import { useFileShare } from "./useFileShare";

/** Full-screen check-and-save view: card photos next to what the AI filled in. */
export default function ReviewSheet({ item, ex, onClose, onSaved }: {
  item: QueueItem | null; // null = typing a card by hand
  ex: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { leads, settings, saveLead, patchLead, savePhotos } = useApp();
  const { remove, retry } = useQueue();
  const { canShare, share } = useFileShare(settings);
  const [form, setForm] = useState<Fields>(() => {
    const base = emptyLead(item ? item.ex : ex);
    const f = item?.fields || {};
    // Only text fields come from the AI; type, exhibition and stage keep their defaults.
    const out = { ...base } as Record<string, unknown>;
    for (const k of ["name", "designation", "company", "phones", "whatsapp", "email", "website", "address", "city", "state", "country", "gst", "products"])
      if (typeof f[k] === "string") out[k] = f[k];
    return out as Fields;
  });
  const [forceNew, setForceNew] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dup = useMemo(() => (forceNew ? null : findDuplicate(form, leads)), [form, leads, forceNew]);
  const colleagues = useMemo(() => sameCompany(form.company, leads, dup?.lead.id), [form.company, leads, dup]);
  const link = waLink(form, settings);
  const failed = item?.status === "failed";

  const valid = () => {
    if (form.name || form.company || form.phones || form.email) return true;
    setErr("Add at least a name, company, phone or email.");
    return false;
  };

  function finish(msg: string) {
    if (item) void remove(item.id);
    onSaved(msg);
  }

  function saveNew(sentWa: boolean) {
    const now = Date.now();
    const id = newLeadId();
    const at = item?.createdAt || now; // the day the card was photographed
    const visits = form.visits.length ? form.visits.map((v) => ({ ...v, at })) : [{ ex, at }];
    void saveLead(id, { ...form, visits, stage: sentWa && form.stage === "New" ? "Contacted" : form.stage, thumb: item?.thumb || "", createdAt: at, updatedAt: now, waSent: sentWa ? now : 0 });
    if (item && settings.keepPhotos) void savePhotos(id, item.front, item.back);
    finish(`${form.name || form.company} saved${sentWa ? " — WhatsApp opened" : ""}.`);
  }

  function updateExisting(old: Lead, sentWa: boolean) {
    const ch = mergeInto(old, form, form.visits[0]?.ex ?? ex);
    if (item?.thumb && !old.thumb) ch.thumb = item.thumb;
    if (sentWa) { ch.waSent = Date.now(); if (old.stage === "New") ch.stage = "Contacted"; }
    void patchLead(old.id, ch);
    if (item && settings.keepPhotos) void savePhotos(old.id, item.front, item.back, true);
    finish(`${old.name || old.company} updated${ch.visits ? " — this meeting was added" : ""}${sentWa ? ", WhatsApp opened" : ""}.`);
  }

  const save = (sentWa: boolean) => {
    if (!valid()) return;
    if (dup) updateExisting(dup.lead, sentWa);
    else saveNew(sentWa);
  };

  return (
    <div className="ov full" role="dialog" aria-modal="true" aria-labelledby="rvH">
      <div className="sheet review-sheet">
        <div className="rv-head">
          <h2 id="rvH">{item ? "Check card" : "Type a card"}</h2>
          <button type="button" className="btn" onClick={onClose}>{item ? "Later" : "Close"}</button>
        </div>
        <div className={"rv-grid" + (item ? "" : " noimg")}>
          {item && (
            <div className="rv-photos">
              <PhotoPanel front={item.front} back={item.back} />
              {!failed && <p className="m">Compare the photo with each field. AI can misread small print, especially phone numbers.</p>}
              {!settings.keepPhotos && <p className="m">This photo is deleted once you save (Settings → Card photos). A small thumbnail stays with the card.</p>}
            </div>
          )}
          <div className="rv-form">
            {failed && (
              <div className="dup">
                <b>Couldn&apos;t read this card automatically</b>
                <p className="m">{item?.error || "Gemini couldn't make it out."} You can try again, or type the details from the photo.</p>
                <div className="acts"><button type="button" className="btn" onClick={() => { void retry(item!.id); onClose(); }}>Try reading again</button></div>
              </div>
            )}
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
                <p className="m">Saving will <b>update this person</b>: blank details get filled, new numbers and notes are added, and this meeting is recorded.</p>
                <div className="acts">
                  <Link className="btn" href={`/dashboard?edit=${encodeURIComponent(dup.lead.id)}`}>Open existing</Link>
                  <button type="button" className="btn" onClick={() => setForceNew(true)}>It&apos;s a different person</button>
                </div>
              </div>
            )}
            {!dup && colleagues.length > 0 && (
              <p className="cohint">Also from <b>{form.company}</b>: {colleagues.slice(0, 3).map((c) => [c.name || "(no name)", c.designation].filter(Boolean).join(" – ")).join("; ")}{colleagues.length > 3 ? ` and ${colleagues.length - 3} more` : ""}. They&apos;ll be grouped together.</p>
            )}
            <LeadFields value={form} onChange={(v) => { setForm(v); setErr(""); }} settings={settings} />
            <div className="row">
              <a className="btn wa" href={link || undefined} aria-disabled={!link} target="_blank" rel="noopener noreferrer"
                onClick={(e) => { if (!link || !valid()) { e.preventDefault(); return; } save(true); }}>
                {dup ? "Update & WhatsApp" : "Save & WhatsApp"}
              </a>
              {canShare && form.kind !== "Vendor" && (
                <button className="btn wa-out" type="button" onClick={() => { if (valid()) void share(form).then((ok) => { if (ok) save(true); }); }}>Send PDF</button>
              )}
              <button className="btn pri" type="button" onClick={() => save(false)}>{dup ? `Update ${dup.lead.name.split(" ")[0] || "existing"}` : "Save card"}</button>
            </div>
            {err && <p className="status err">{err}</p>}
            <p className="muted small">{link ? `WhatsApp to +${waNumber(form.whatsapp || form.phones, settings.cc)} · ${form.kind === "Vendor" ? "vendor" : "buyer"} message` : "Add a phone or WhatsApp number to send a message."}</p>
            {item && (
              <div className="row">
                {confirmDiscard
                  ? <><button className="btn danger" type="button" onClick={() => { void remove(item.id); onSaved("Card discarded."); }}>Yes, discard this card</button><button className="btn" type="button" onClick={() => setConfirmDiscard(false)}>Keep it</button></>
                  : <button className="btn danger-txt" type="button" onClick={() => setConfirmDiscard(true)}>Discard card</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
