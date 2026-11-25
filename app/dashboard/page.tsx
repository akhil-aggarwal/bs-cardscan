"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import Shell from "@/components/Shell";
import LeadFields from "@/components/LeadFields";
import { downloadCsv, isDue, STAGES, toTsv, waLink, type Lead, type LeadFields as Fields } from "@/lib/leads";

const fmt = (ts: number) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fmtDate = (d: string) => new Date(d + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="panel">
      <h3>{title}</h3>
      {rows.length ? rows.map(([k, v]) => (
        <div className="bar" key={k}><span>{k}</span><i style={{ width: `${(v / max) * 100}%` }} /><b>{v}</b></div>
      )) : <p className="muted small">Nothing yet.</p>}
    </div>
  );
}

function Dashboard() {
  const { leads, settings, patchLead, deleteLead, loading } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [fInt, setFInt] = useState("");
  const [fStage, setFStage] = useState("");
  const [fWa, setFWa] = useState("");
  const [sort, setSort] = useState("new");
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState<{ id: string; v: Fields } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Lead | null>(null);

  // Open the editor when coming from "Edit" on the scan page.
  const editParam = params.get("edit");
  useEffect(() => {
    if (!editParam) return;
    const l = leads.find((x) => x.id === editParam);
    if (l) {
      openEdit(l);
      router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, leads]);

  function openEdit(l: Lead) {
    const { id, thumb, createdAt, updatedAt, waSent, ...v } = l;
    void thumb; void createdAt; void updatedAt; void waSent;
    setEdit({ id, v });
  }
  const markSent = (l: Pick<Lead, "id" | "stage">) => void patchLead(l.id, { waSent: Date.now(), stage: l.stage === "New" ? "Contacted" : l.stage });

  const n = leads.length;
  const count = (f: (l: Lead) => boolean) => leads.filter(f).length;
  const sent = count((l) => !!l.waSent), hot = count((l) => l.interest === "Hot"), due = count(isDue), won = count((l) => l.stage === "Order won");

  const locations = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) {
      const k = (l.country && !/^india$/i.test(l.country) ? l.country : l.city || l.country).trim();
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [leads]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const r = leads.filter((l) =>
      (!s || [l.name, l.company, l.city, l.country, l.phones, l.email, l.notes, l.products, l.designation].join(" ").toLowerCase().includes(s)) &&
      (!fInt || (fInt === "-" ? !l.interest : l.interest === fInt)) &&
      (!fStage || (fStage === "due" ? isDue(l) : l.stage === fStage)) &&
      (!fWa || (fWa === "yes" ? !!l.waSent : !l.waSent)));
    const ir: Record<string, number> = { Hot: 0, Warm: 1, Cold: 2 };
    const by: Record<string, (a: Lead, b: Lead) => number> = {
      new: (a, b) => b.createdAt - a.createdAt,
      old: (a, b) => a.createdAt - b.createdAt,
      name: (a, b) => (a.name || "~").localeCompare(b.name || "~"),
      int: (a, b) => (ir[a.interest] ?? 3) - (ir[b.interest] ?? 3),
      fu: (a, b) => (a.followUp || "9999").localeCompare(b.followUp || "9999"),
    };
    return r.sort(by[sort]);
  }, [leads, q, fInt, fStage, fWa, sort]);

  const quick = (kind: string, v: string) => {
    setQ(""); setFInt(kind === "int" ? v : ""); setFStage(kind === "stage" ? v : ""); setFWa(kind === "wa" ? v : "");
    document.getElementById("all")?.scrollIntoView({ behavior: "smooth" });
  };

  const title = n ? [`${n} leads`, hot ? `${hot} hot` : "", n - sent ? `${n - sent} still to WhatsApp` : ""].filter(Boolean).join(", ") : "Leads dashboard";
  const editLink = edit ? waLink(edit.v, settings) : "";

  return (
    <Shell>
      <main className="wrap">
        <section>
          <h2>{loading ? "Loading leads…" : title}</h2>
          <div className="kpis">
            <button className="kpi" onClick={() => quick("", "")}><span className="num">{n}</span><span>Total leads</span></button>
            <button className="kpi hot" onClick={() => quick("int", "Hot")}><span className="num">{hot}</span><span>Hot leads</span></button>
            <button className="kpi" onClick={() => quick("wa", "no")}><span className="num">{n - sent}</span><span>WhatsApp not sent</span></button>
            <button className="kpi due" onClick={() => quick("stage", "due")}><span className="num">{due}</span><span>Follow-ups due</span></button>
            <button className="kpi" onClick={() => quick("stage", "Order won")}><span className="num">{won}</span><span>Orders won</span></button>
          </div>
        </section>

        <section className="panels">
          <Bars title="Pipeline stage" rows={STAGES.map((s) => [s, count((l) => l.stage === s)] as [string, number]).filter((r) => r[1])} />
          <Bars title="Interest" rows={([["Hot", hot], ["Warm", count((l) => l.interest === "Warm")], ["Cold", count((l) => l.interest === "Cold")], ["Not marked", count((l) => !l.interest)]] as [string, number][]).filter((r) => r[1])} />
          <Bars title="Top locations" rows={locations} />
        </section>

        <section id="all">
          <h2>All leads</h2>
          <div className="filters">
            <input type="search" className="full" placeholder="Search name, company, city, notes…" aria-label="Search leads" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Filter by interest" value={fInt} onChange={(e) => setFInt(e.target.value)}>
              <option value="">All interest</option><option>Hot</option><option>Warm</option><option>Cold</option><option value="-">Not marked</option>
            </select>
            <select aria-label="Filter by stage" value={fStage} onChange={(e) => setFStage(e.target.value)}>
              <option value="">All stages</option><option value="due">Follow-up due</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select aria-label="Filter by WhatsApp" value={fWa} onChange={(e) => setFWa(e.target.value)}>
              <option value="">WhatsApp: all</option><option value="no">Not yet sent</option><option value="yes">Sent</option>
            </select>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option><option value="int">Hot first</option><option value="fu">Follow-up date</option>
            </select>
          </div>
          <div className="row">
            <button className="btn" onClick={() => (n ? downloadCsv(leads) : setNote("No leads to export yet."))}>Download CSV</button>
            <button className="btn" onClick={async () => {
              if (!n) return setNote("No leads to copy yet.");
              try { await navigator.clipboard.writeText(toTsv(leads)); setNote(`Copied ${n} leads. Open a Google Sheet, tap cell A1 and paste.`); }
              catch { setNote("Copy was blocked by the browser."); }
            }}>Copy for Google Sheets</button>
          </div>
          <p className="muted small">{note || (n ? `Showing ${rows.length} of ${n}.` : "")}</p>

          {!n ? <div className="empty">No leads yet. Scan your first card from the Scan tab.</div>
            : !rows.length ? <div className="empty">No leads match these filters.</div>
            : (
              <table className="stack">
                <thead><tr><th>Lead</th><th>Contact</th><th>Location</th><th>Interest</th><th>Stage</th><th>Follow-up</th><th>Notes</th><th /></tr></thead>
                <tbody>
                  {rows.map((l) => {
                    const wl = waLink(l, settings);
                    return (
                      <tr key={l.id} className={isDue(l) ? "due" : ""}>
                        <td data-l="Lead"><b>{l.name || "(no name)"}</b><div className="m">{[l.designation, l.company].filter(Boolean).join(", ")}</div><div className="m">Scanned {fmt(l.createdAt)}</div></td>
                        <td data-l="Contact"><div>{l.phones}</div><div className="m">{l.email}</div></td>
                        <td data-l="Location">{[l.city, l.country].filter(Boolean).join(", ")}</td>
                        <td data-l="Interest">
                          <select aria-label="Interest" value={l.interest} onChange={(e) => void patchLead(l.id, { interest: e.target.value as Lead["interest"] })}>
                            <option value="">—</option><option>Hot</option><option>Warm</option><option>Cold</option>
                          </select>
                        </td>
                        <td data-l="Stage">
                          <select aria-label="Stage" value={l.stage} onChange={(e) => void patchLead(l.id, { stage: e.target.value as Lead["stage"] })}>
                            {STAGES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td data-l="Follow-up">{l.followUp && <>{fmtDate(l.followUp)}{isDue(l) && <b className="duetxt"> due</b>}</>}</td>
                        <td data-l="Notes"><div className="clip">{l.notes}</div></td>
                        <td data-l="">
                          <div className="acts">
                            {wl ? <a className="btn wa" href={wl} target="_blank" rel="noopener noreferrer" onClick={() => markSent(l)}>WhatsApp{l.waSent ? " again" : ""}</a> : <span className="m">No number</span>}
                            <button className="btn" onClick={() => openEdit(l)}>Edit</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </section>
      </main>

      {edit && (
        <div className="ov" role="dialog" aria-modal="true" aria-labelledby="edH" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="sheet">
            <h2 id="edH">Edit {edit.v.name || edit.v.company || "lead"}</h2>
            <LeadFields value={edit.v} onChange={(v) => setEdit({ ...edit, v })} showStage />
            <div className="row">
              <a className="btn wa" href={editLink || undefined} aria-disabled={!editLink} target="_blank" rel="noopener noreferrer"
                onClick={(e) => {
                  if (!editLink) return e.preventDefault();
                  void patchLead(edit.id, { ...edit.v, waSent: Date.now(), stage: edit.v.stage === "New" ? "Contacted" : edit.v.stage });
                  setEdit(null);
                }}>WhatsApp</a>
              <button className="btn pri" onClick={() => { void patchLead(edit.id, edit.v); setEdit(null); }}>Save changes</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            </div>
            <div className="row"><button className="btn danger-txt" onClick={() => { setConfirmDel(leads.find((x) => x.id === edit.id) || null); setEdit(null); }}>Delete lead</button></div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="ov" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>Delete this lead?</h2>
            <p>{confirmDel.name || confirmDel.company || "This lead"} will be removed for good.</p>
            <div className="row">
              <button className="btn danger" onClick={() => { void deleteLead(confirmDel.id); setConfirmDel(null); }}>Delete</button>
              <button className="btn" onClick={() => setConfirmDel(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default function DashboardPage() {
  return <Suspense><Dashboard /></Suspense>;
}
