"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { auth } from "@/lib/firebase";
import { useApp } from "@/components/AppProvider";
import Shell from "@/components/Shell";
import ErrorLog from "@/components/ErrorLog";
import { logError } from "@/lib/log";
import {
  DEFAULT_TEMPLATE, DEFAULT_VENDOR_TEMPLATE, effectiveEx, fmtDate, fmtSize, newExId, today, waLink,
  type Attachment, type Exhibition,
} from "@/lib/leads";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const MAX = 50 * 1024 * 1024;

export default function SettingsPage() {
  const { settings, saveSettings, user, logout, leads } = useApp();
  const [tpl, setTpl] = useState(settings.tpl);
  const [vtpl, setVtpl] = useState(settings.vendorTpl);
  const [cc, setCc] = useState(settings.cc);
  const [exForm, setExForm] = useState<Exhibition | null>(null);
  const [exErr, setExErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [up, setUp] = useState<{ name: string; pct: number } | null>(null);
  const [upErr, setUpErr] = useState("");
  const [confirmDel, setConfirmDel] = useState<Attachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTpl(settings.tpl); setVtpl(settings.vendorTpl); setCc(settings.cc); }, [settings.tpl, settings.vendorTpl, settings.cc]);

  /* ---------- exhibitions ---------- */
  const exCount = (id: string) => leads.filter((l) => l.visits.some((v) => v.ex === id)).length;
  const eff = effectiveEx(settings);
  const autoPicked = settings.autoSwitch && eff && eff !== settings.currentEx;
  function saveEx() {
    if (!exForm) return;
    const name = exForm.name.trim();
    if (!name) return setExErr("Give the exhibition a name, e.g. World Mithai Namkeen Convention 2027.");
    if (exForm.start && exForm.end && exForm.end < exForm.start) return setExErr("The end date is before the start date.");
    const isNew = !exForm.id || !settings.exhibitions.some((x) => x.id === exForm.id);
    const ex = { ...exForm, id: exForm.id || newExId(name), name, city: exForm.city.trim() };
    const exhibitions = isNew ? [...settings.exhibitions, ex] : settings.exhibitions.map((x) => (x.id === ex.id ? ex : x));
    // A brand-new exhibition becomes the current one, so new cards go to it.
    void saveSettings({ ...settings, exhibitions, currentEx: isNew ? ex.id : settings.currentEx });
    setExForm(null);
    setExErr("");
  }
  function removeEx(x: Exhibition) {
    if (exCount(x.id)) return;
    void saveSettings({ ...settings, exhibitions: settings.exhibitions.filter((e) => e.id !== x.id), currentEx: settings.currentEx === x.id ? "" : settings.currentEx });
  }
  const hardcoded = /indusfood/i.test(tpl) && !tpl.includes("{exhibition}");

  const atts = settings.attachments;
  const saveAtts = (attachments: Attachment[]) => saveSettings({ ...settings, attachments });
  const sample = { name: "Ravi", company: "Ravi Foods", phones: "9876543210", whatsapp: "", visits: [{ ex: eff, at: Date.now() }] };
  const preview = waLink({ ...sample, kind: "Buyer" }, { ...settings, tpl, cc });
  const vpreview = waLink({ ...sample, kind: "Vendor" }, { ...settings, vendorTpl: vtpl, cc });

  async function onPick(f: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setUpErr("");
    if (!ACCEPT.split(",").includes(f.type)) return setUpErr("Please choose a PDF or an image (JPG, PNG, WebP).");
    if (f.size > MAX) return setUpErr("That file is over 50 MB. Compress the PDF (e.g. ilovepdf.com) and try again.");
    setUp({ name: f.name, pct: 0 });
    try {
      const token = await auth.currentUser?.getIdToken();
      const safe = f.name.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
      const blob = await upload(`attachments/${safe}`, f, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: token || "",
        multipart: f.size > 8 * 1024 * 1024,
        onUploadProgress: (e) => setUp({ name: f.name, pct: Math.round(e.percentage) }),
      });
      const base = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
      await saveAtts([...atts, { url: blob.url, name: base || "Catalogue", fileName: f.name, size: f.size, type: f.type, inMessage: true }]);
    } catch (e) {
      logError("uploading attachment", e, { file: f.name, size: f.size });
      const m = (e as Error).message || "";
      setUpErr(m.includes("not connected") || m.includes("BLOB") ? "File storage isn't connected yet — see step 1 in the setup notes (Vercel → Storage → Blob)." : "Upload failed: " + (m || "check your internet and try again."));
    } finally {
      setUp(null);
    }
  }

  async function remove(a: Attachment) {
    setConfirmDel(null);
    await saveAtts(atts.filter((x) => x.url !== a.url));
    const token = await auth.currentUser?.getIdToken();
    void fetch("/api/attachment-delete", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ url: a.url }) });
  }

  const update = (url: string, ch: Partial<Attachment>) => saveAtts(atts.map((a) => (a.url === url ? { ...a, ...ch } : a)));

  return (
    <Shell>
      <main className="wrap narrow">
        <section id="exhibitions">
          <h2>Exhibitions</h2>
          <p className="muted">Every card you scan is filed under the current exhibition. Add the next one before it starts, e.g. World Mithai Namkeen Convention.</p>
          <div className="exlist">
            {settings.exhibitions.map((x) => {
              const c = exCount(x.id);
              return (
                <div className={"exrow" + (x.id === eff ? " cur" : "")} key={x.id}>
                  <label className="check">
                    <input type="radio" name="curex" checked={settings.currentEx === x.id} onChange={() => void saveSettings({ ...settings, currentEx: x.id })} />
                    <span><b>{x.name}</b>{x.id === eff && <span className="tag t-Cold">Saving here now</span>}
                      <span className="m" style={{ display: "block" }}>{[x.city, x.start && x.end ? `${fmtDate(x.start)} – ${fmtDate(x.end)}` : x.start ? `from ${fmtDate(x.start)}` : ""].filter(Boolean).join(" · ") || "No dates set"} · {c} card{c === 1 ? "" : "s"}</span>
                    </span>
                  </label>
                  <div className="acts">
                    <button className="btn" onClick={() => { setExErr(""); setExForm({ ...x }); }}>Edit</button>
                    <button className="btn danger-txt" disabled={c > 0} title={c ? "Has cards — can't delete" : ""} onClick={() => removeEx(x)}>Delete</button>
                  </div>
                </div>
              );
            })}
            <div className={"exrow" + (!eff ? " cur" : "")}>
              <label className="check">
                <input type="radio" name="curex" checked={!settings.currentEx} onChange={() => void saveSettings({ ...settings, currentEx: "" })} />
                <span><b>No exhibition</b><span className="m" style={{ display: "block" }}>For office visits and meetings outside fairs</span></span>
              </label>
            </div>
          </div>
          <label className="check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={settings.autoSwitch} onChange={(e) => void saveSettings({ ...settings, autoSwitch: e.target.checked })} />
            Switch automatically on an exhibition&apos;s dates
          </label>
          {autoPicked && <p className="m">Today falls within its dates, so cards are going to <b>{settings.exhibitions.find((x) => x.id === eff)?.name}</b>. Untick to choose by hand.</p>}
          {exForm ? (
            <div className="panelform">
              <div className="grid">
                <label className="f full">Exhibition name<input value={exForm.name} placeholder="e.g. World Mithai Namkeen Convention 2027" onChange={(e) => setExForm({ ...exForm, name: e.target.value })} /></label>
                <label className="f">City<input value={exForm.city} onChange={(e) => setExForm({ ...exForm, city: e.target.value })} /></label>
                <label className="f">Starts<input type="date" value={exForm.start} onChange={(e) => setExForm({ ...exForm, start: e.target.value })} /></label>
                <label className="f">Ends<input type="date" value={exForm.end} onChange={(e) => setExForm({ ...exForm, end: e.target.value })} /></label>
              </div>
              <div className="row">
                <button className="btn pri" onClick={saveEx}>{exForm.id ? "Save" : "Add and make current"}</button>
                <button className="btn" onClick={() => setExForm(null)}>Cancel</button>
              </div>
              {exErr && <p className="status err">{exErr}</p>}
            </div>
          ) : (
            <div className="row"><button className="btn pri" onClick={() => { setExErr(""); setExForm({ id: "", name: "", city: "", start: today(), end: "" }); }}>+ Add exhibition</button></div>
          )}
        </section>

        <section>
          <h2>Attachments</h2>
          <p className="muted">Upload your catalogue, price list or product photos. Their links are added to every WhatsApp message to buyers, and the <b>Send PDF</b> button shares the actual file.</p>
          {atts.length === 0 && !up && <div className="empty">No attachments yet.</div>}
          {atts.map((a) => (
            <div className="att" key={a.url}>
              <div className="att-ic" aria-hidden>{a.type === "application/pdf" ? "PDF" : "IMG"}</div>
              <div className="att-body">
                <label className="f">Name shown to buyers
                  <input defaultValue={a.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== a.name) void update(a.url, { name: v }); }} />
                </label>
                <div className="m">{a.fileName} · {fmtSize(a.size)}</div>
                <label className="check"><input type="checkbox" checked={a.inMessage} onChange={(e) => void update(a.url, { inMessage: e.target.checked })} /> Add link to WhatsApp message</label>
                <div className="acts">
                  <a className="btn" href={a.url} target="_blank" rel="noopener noreferrer">Open</a>
                  <button className="btn danger-txt" onClick={() => setConfirmDel(a)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          {up && <div className="att"><div className="att-ic" aria-hidden>…</div><div className="att-body"><b>{up.name}</b><div className="prog"><i style={{ width: `${up.pct}%` }} /></div><div className="m">Uploading {up.pct}%</div></div></div>}
          <div className="row">
            <label className={"btn pri" + (up ? " disabled" : "")}>
              + Add attachment
              <input ref={fileRef} type="file" accept={ACCEPT} hidden disabled={!!up} onChange={(e) => onPick(e.target.files?.[0])} />
            </label>
          </div>
          <p className={"status" + (upErr ? " err" : "")} role="status">{upErr || "PDF or image, up to 50 MB. Smaller files (under 5 MB) open faster for buyers."}</p>
        </section>

        <section>
          <h2>WhatsApp messages</h2>
          <p className="muted"><code>{"{name}"}</code>, <code>{"{company}"}</code> and <code>{"{exhibition}"}</code> (where you met) are filled in automatically. For buyers, attachment links go at the end — or put <code>{"{catalogue}"}</code> where you want them.</p>
          <label className="f" htmlFor="tpl-b">Message to buyers</label>
          <textarea id="tpl-b" className="tpl" value={tpl} onChange={(e) => { setTpl(e.target.value); setSaved(false); }} />
          {hardcoded && <p className="status err">Your message mentions Indusfood by name. Replace it with <code>{"{exhibition}"}</code> so the right exhibition is filled in each time.</p>}
          <div className="row">
            {preview && <a className="btn" href={preview} target="_blank" rel="noopener noreferrer">Preview buyer message</a>}
            <button className="btn" onClick={() => { setTpl(DEFAULT_TEMPLATE); setSaved(false); }}>Reset buyer message</button>
          </div>
          <label className="f" htmlFor="tpl-v" style={{ marginTop: 16 }}>Message to vendors (no catalogue attached)</label>
          <textarea id="tpl-v" className="tpl short" value={vtpl} onChange={(e) => { setVtpl(e.target.value); setSaved(false); }} />
          <div className="row">
            {vpreview && <a className="btn" href={vpreview} target="_blank" rel="noopener noreferrer">Preview vendor message</a>}
            <button className="btn" onClick={() => { setVtpl(DEFAULT_VENDOR_TEMPLATE); setSaved(false); }}>Reset vendor message</button>
          </div>
          <label className="f" style={{ marginTop: 12, maxWidth: 260 }}>Default country code (used when a number has none)
            <input inputMode="numeric" value={cc} onChange={(e) => { setCc(e.target.value.replace(/\D/g, "")); setSaved(false); }} />
          </label>
          <div className="row">
            <button className="btn pri" onClick={() => { void saveSettings({ ...settings, tpl: tpl.trim() || DEFAULT_TEMPLATE, vendorTpl: vtpl.trim() || DEFAULT_VENDOR_TEMPLATE, cc: cc || "91" }); setSaved(true); }}>Save messages</button>
          </div>
          <p className="status" role="status">{saved ? "Saved." : ""}</p>
        </section>

        <ErrorLog />

        <section>
          <h2>Account</h2>
          <p className="muted">Signed in as {user.email || user.uid}.</p>
          <div className="row"><button className="btn" onClick={logout}>Sign out</button></div>
        </section>
      </main>

      {confirmDel && (
        <div className="ov" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>Remove {confirmDel.name}?</h2>
            <p>The file is deleted, and links already sent to buyers will stop working.</p>
            <div className="row">
              <button className="btn danger" onClick={() => void remove(confirmDel)}>Remove</button>
              <button className="btn" onClick={() => setConfirmDel(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
