"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import Shell from "@/components/Shell";
import LeadFields from "@/components/LeadFields";
import PhotoPanel from "@/components/PhotoPanel";
import { haystack, matchesSearch, placeOf } from "@/lib/places";
import { useFileShare } from "@/components/useFileShare";
import {
  BUYER_STAGES, VENDOR_STAGES, WON, downloadCsv, effectiveEx, exName, fmtDate, fmtDayShort, groupCompanies, isDue, lastVisit,
  stagesFor, toTsv, waLink, type Lead, type LeadFields as Fields,
} from "@/lib/leads";

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

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, t]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}
    </div>
  );
}

const ALL_STAGES = [...new Set([...BUYER_STAGES, ...VENDOR_STAGES])];

function Dashboard() {
  const { leads, settings, patchLead, deleteLead, loading, loadPhotos, deletePhotos } = useApp();
  const [photos, setPhotos] = useState<{ front: string; back: string; stored: boolean } | null>(null);
  const [confirmPhotoDel, setConfirmPhotoDel] = useState(false);
  const { canShare, share } = useFileShare(settings);
  const params = useSearchParams();
  const router = useRouter();
  const cur = effectiveEx(settings);
  const [fEx, setFEx] = useState<string | null>(null); // null = not chosen yet → current exhibition
  const exSel = fEx ?? (cur || "all");
  const [kind, setKind] = useState<"all" | "Buyer" | "Vendor">("all");
  const [view, setView] = useState<"people" | "companies">("people");
  const [q, setQ] = useState("");
  const [fCountry, setFCountry] = useState("");
  const [fState, setFState] = useState("");
  const [fCity, setFCity] = useState("");
  const [fDeals, setFDeals] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [fInt, setFInt] = useState("");
  const [fStage, setFStage] = useState("");
  const [fWa, setFWa] = useState("");
  const [sort, setSort] = useState("new");
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState<{ id: string; v: Fields } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Lead | null>(null);

  // Open the editor when coming from "Edit" or "Open existing" on the scan page.
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
    void createdAt; void updatedAt; void waSent;
    setEdit({ id, v });
    setPhotos(null);
    setConfirmPhotoDel(false);
    void loadPhotos(id).then((p) => setPhotos(p && (p.front || p.back) ? { ...p, stored: true } : { front: thumb, back: "", stored: false }));
  }
  const markSent = (l: Pick<Lead, "id" | "stage">) => void patchLead(l.id, { waSent: Date.now(), stage: l.stage === "New" ? "Contacted" : l.stage });

  /* scope = chosen exhibition + buyers/vendors; everything on the page follows it */
  const scope = useMemo(() => leads.filter((l) =>
    (exSel === "all" || (exSel === "none" ? l.visits.every((v) => !v.ex) : l.visits.some((v) => v.ex === exSel))) &&
    (kind === "all" || l.kind === kind)), [leads, exSel, kind]);

  const n = scope.length;
  const count = (f: (l: Lead) => boolean) => scope.filter(f).length;
  const sent = count((l) => !!l.waSent), hot = count((l) => l.interest === "Hot"), due = count(isDue), won = count((l) => WON.includes(l.stage));
  const stageList = kind === "all" ? ALL_STAGES : stagesFor(kind);

  const locations = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of scope) {
      const p = placeOf(l);
      const k = p.country && p.country !== "India" ? p.country : p.city || p.state || p.country;
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [scope]);

  const byEx = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of scope) for (const ex of new Set(l.visits.map((v) => v.ex))) m[exName(ex, settings)] = (m[exName(ex, settings)] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [scope, settings]);

  /* every card's tidied location and searchable text, worked out once */
  const meta = useMemo(() => new Map(scope.map((l) => [l.id, { place: placeOf(l), hay: haystack(l, settings), deals: `${l.products} ${l.notes}`.toLowerCase() }])), [scope, settings]);
  const opts = (pick: (p: { country: string; state: string; city: string }) => string, keep: (p: { country: string; state: string; city: string }) => boolean) => {
    const m: Record<string, number> = {};
    for (const x of meta.values()) if (keep(x.place)) { const v = pick(x.place); if (v) m[v] = (m[v] || 0) + 1; }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  };
  const countryOpts = opts((p) => p.country, () => true);
  const stateOpts = opts((p) => p.state, (p) => !fCountry || p.country === fCountry);
  const cityOpts = opts((p) => p.city, (p) => (!fCountry || p.country === fCountry) && (!fState || p.state === fState));
  const nFilters = [fCountry, fState, fCity, fDeals, fInt, fStage, fWa].filter(Boolean).length;
  const clearFilters = () => { setQ(""); setFCountry(""); setFState(""); setFCity(""); setFDeals(""); setFInt(""); setFStage(""); setFWa(""); };

  const rows = useMemo(() => {
    const deals = fDeals.trim().toLowerCase().split(/[\s,]+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w));
    const r = scope.filter((l) => {
      const m = meta.get(l.id)!;
      return (!q.trim() || matchesSearch(m.hay, q)) &&
      (!fCountry || m.place.country === fCountry) &&
      (!fState || m.place.state === fState) &&
      (!fCity || m.place.city === fCity) &&
      (!deals.length || deals.every((w) => m.deals.includes(w))) &&
      (!fInt || (fInt === "-" ? !l.interest : l.interest === fInt)) &&
      (!fStage || (fStage === "due" ? isDue(l) : l.stage === fStage)) &&
      (!fWa || (fWa === "yes" ? !!l.waSent : !l.waSent));
    });
    const ir: Record<string, number> = { Hot: 0, Warm: 1, Cold: 2 };
    const lastAt = (l: Lead) => l.visits[l.visits.length - 1]?.at || l.createdAt;
    const by: Record<string, (a: Lead, b: Lead) => number> = {
      new: (a, b) => lastAt(b) - lastAt(a),
      old: (a, b) => lastAt(a) - lastAt(b),
      name: (a, b) => (a.name || "~").localeCompare(b.name || "~"),
      company: (a, b) => (a.company || "~").localeCompare(b.company || "~"),
      int: (a, b) => (ir[a.interest] ?? 3) - (ir[b.interest] ?? 3),
      fu: (a, b) => (a.followUp || "9999").localeCompare(b.followUp || "9999"),
    };
    return r.sort(by[sort]);
  }, [scope, meta, q, fCountry, fState, fCity, fDeals, fInt, fStage, fWa, sort]);

  const companies = useMemo(() => groupCompanies(rows), [rows]);

  const quick = (k: string, v: string) => {
    clearFilters(); setFInt(k === "int" ? v : ""); setFStage(k === "stage" ? v : ""); setFWa(k === "wa" ? v : "");
    if (k === "won") setFStage(kind === "Vendor" ? "Approved vendor" : "Order won");
    document.getElementById("all")?.scrollIntoView({ behavior: "smooth" });
  };

  const scopeLabel = `${exSel === "all" ? "All exhibitions" : exName(exSel === "none" ? "" : exSel, settings)}${kind === "all" ? "" : ` – ${kind}s`}`;
  const editLink = edit ? waLink(edit.v, settings) : "";
  const pdfOk = (k: string) => canShare && k === "Buyer";

  const Actions = ({ l }: { l: Lead }) => {
    const wl = waLink(l, settings);
    return (
      <div className="acts">
        {wl ? <a className="btn wa" href={wl} target="_blank" rel="noopener noreferrer" onClick={() => markSent(l)}>WhatsApp{l.waSent ? " again" : ""}</a> : <span className="m">No number</span>}
        {pdfOk(l.kind) && <button className="btn wa-out" onClick={() => void share(l).then((ok) => { if (ok) markSent(l); })}>Send PDF</button>}
        <button className="btn" onClick={() => openEdit(l)}>Edit</button>
      </div>
    );
  };

  return (
    <Shell>
      <main className="wrap">
        <section className="scopebar">
          <label className="f">Exhibition
            <select value={exSel} onChange={(e) => { setFEx(e.target.value); setFStage(""); }}>
              <option value="all">All exhibitions</option>
              {settings.exhibitions.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === cur ? " (current)" : ""}</option>)}
              <option value="none">No exhibition</option>
            </select>
          </label>
          <Seg label="Buyers or vendors" value={kind} onChange={(v) => { setKind(v); setFStage(""); }} options={[["all", "All"], ["Buyer", "Buyers"], ["Vendor", "Vendors"]]} />
        </section>

        <section>
          <h2>{loading ? "Loading…" : n ? `${scopeLabel}: ${n} card${n === 1 ? "" : "s"}` : scopeLabel}</h2>
          <div className="kpis">
            <button className="kpi" onClick={() => quick("", "")}><span className="num">{n}</span><span>Cards</span></button>
            <button className="kpi hot" onClick={() => quick("int", "Hot")}><span className="num">{hot}</span><span>Hot</span></button>
            <button className="kpi" onClick={() => quick("wa", "no")}><span className="num">{n - sent}</span><span>WhatsApp not sent</span></button>
            <button className="kpi due" onClick={() => quick("stage", "due")}><span className="num">{due}</span><span>Follow-ups due</span></button>
            <button className="kpi" onClick={() => quick("won", "")}><span className="num">{won}</span><span>{kind === "Vendor" ? "Approved vendors" : kind === "Buyer" ? "Orders won" : "Orders won / approved"}</span></button>
          </div>
        </section>

        <section className="panels">
          <Bars title="Stage" rows={stageList.map((s) => [s, count((l) => l.stage === s)] as [string, number]).filter((r) => r[1])} />
          {exSel === "all"
            ? <Bars title="By exhibition" rows={byEx} />
            : <Bars title="Interest" rows={([["Hot", hot], ["Warm", count((l) => l.interest === "Warm")], ["Cold", count((l) => l.interest === "Cold")], ["Not marked", count((l) => !l.interest)]] as [string, number][]).filter((r) => r[1])} />}
          <Bars title="Top locations" rows={locations} />
        </section>

        <section id="all">
          <div className="listhead">
            <h2>{view === "people" ? "People" : "Companies"}</h2>
            <Seg label="View" value={view} onChange={setView} options={[["people", "People"], ["companies", "Companies"]]} />
          </div>
          <div className="searchrow">
            <input type="search" placeholder="Search anything, e.g. Bangalore dry fruits" aria-label="Search cards" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className={"btn" + (showFilters ? " pri" : "")} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
              Filters{nFilters > 0 && <span className="pill">{nFilters}</span>}
            </button>
          </div>
          <p className="muted small">Every word must match: <i>Cochin hot</i>, <i>Kerala buyer</i>, <i>Dubai cashew</i>. Old and new city names both work (Cochin = Kochi, Bangalore = Bengaluru).</p>
          {showFilters && (
            <div className="filterpanel">
              <div className="filters">
                <label className="f">Country
                  <select value={fCountry} onChange={(e) => { setFCountry(e.target.value); setFState(""); setFCity(""); }}>
                    <option value="">All countries</option>{countryOpts.map(([v, c]) => <option key={v} value={v}>{v} ({c})</option>)}
                  </select>
                </label>
                <label className="f">State / region
                  <select value={fState} onChange={(e) => { setFState(e.target.value); setFCity(""); }}>
                    <option value="">All states</option>{stateOpts.map(([v, c]) => <option key={v} value={v}>{v} ({c})</option>)}
                  </select>
                </label>
                <label className="f">City
                  <select value={fCity} onChange={(e) => setFCity(e.target.value)}>
                    <option value="">All cities</option>{cityOpts.map(([v, c]) => <option key={v} value={v}>{v} ({c})</option>)}
                  </select>
                </label>
                <label className="f">Deals in / supplies
                  <input value={fDeals} placeholder="e.g. dry fruits, spices" onChange={(e) => setFDeals(e.target.value)} />
                </label>
                <label className="f">Interest
                  <select value={fInt} onChange={(e) => setFInt(e.target.value)}>
                    <option value="">All</option><option>Hot</option><option>Warm</option><option>Cold</option><option value="-">Not marked</option>
                  </select>
                </label>
                <label className="f">Stage
                  <select value={fStage} onChange={(e) => setFStage(e.target.value)}>
                    <option value="">All stages</option><option value="due">Follow-up due</option>{stageList.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="f">WhatsApp
                  <select value={fWa} onChange={(e) => setFWa(e.target.value)}>
                    <option value="">All</option><option value="no">Not yet sent</option><option value="yes">Sent</option>
                  </select>
                </label>
                <label className="f">Sort
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="new">Newest meeting first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option><option value="company">Company A–Z</option><option value="int">Hot first</option><option value="fu">Follow-up date</option>
                  </select>
                </label>
              </div>
              <div className="row"><button className="btn" onClick={clearFilters}>Clear all filters</button></div>
            </div>
          )}
          {nFilters > 0 && !showFilters && (
            <p className="chips-on">
              {[fCountry, fState, fCity, fDeals && `deals in "${fDeals}"`, fInt && (fInt === "-" ? "no interest marked" : fInt), fStage && (fStage === "due" ? "follow-up due" : fStage), fWa && (fWa === "yes" ? "WhatsApp sent" : "WhatsApp not sent")].filter(Boolean).map((t) => <span key={String(t)} className="tag t-Cold">{t}</span>)}
              <button type="button" className="linkbtn" onClick={clearFilters}>Clear</button>
            </p>
          )}
          <div className="row">
            <button className="btn" onClick={() => (rows.length ? downloadCsv(rows, settings, scopeLabel) : setNote("Nothing to export."))}>Download CSV ({rows.length})</button>
            <button className="btn" onClick={async () => {
              if (!rows.length) return setNote("Nothing to copy.");
              try { await navigator.clipboard.writeText(toTsv(rows, settings)); setNote(`Copied ${rows.length} cards. Open a Google Sheet, tap cell A1 and paste.`); }
              catch { setNote("Copy was blocked by the browser."); }
            }}>Copy for Google Sheets</button>
          </div>
          <p className="muted small">{note || (n ? `Showing ${rows.length} of ${n}${view === "companies" ? ` · ${companies.filter((c) => c.key !== "__none__").length} companies` : ""}.` : "")}</p>

          {!leads.length ? <div className="empty">No cards yet. Scan your first card from the Scan tab.</div>
            : !n ? <div className="empty">No cards for {scopeLabel} yet.</div>
            : !rows.length ? <div className="empty">No cards match these filters.</div>
            : view === "companies" ? (
              <div className="companies">
                {companies.map((c) => (
                  <div className="co" key={c.key}>
                    <div className="co-head">
                      <b>{c.name}</b>
                      <span className="m">{c.people.length} {c.people.length === 1 ? "person" : "people"}{c.kinds.map((k) => <span key={k} className={`tag k-${k}`}>{k}</span>)}</span>
                    </div>
                    {c.people.map((l) => {
                      const lv = lastVisit(l, settings);
                      return (
                        <div className="co-p" key={l.id}>
                          <div>
                            <b>{l.name || "(no name)"}</b>{l.designation && <span className="m"> – {l.designation}</span>}
                            {c.key === "__none__" && l.company && <span className="m"> · {l.company}</span>}
                            <div className="m">{l.phones}{l.phones && " · "}{lv.label}{lv.more ? ` (+${lv.more})` : ""} · {l.stage}</div>
                          </div>
                          <Actions l={l} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <table className="stack">
                <thead><tr><th>Person</th><th>Contact</th><th>Met</th><th>Interest</th><th>Stage</th><th>Follow-up</th><th>Notes</th><th /></tr></thead>
                <tbody>
                  {rows.map((l) => {
                    const lv = lastVisit(l, settings);
                    return (
                      <tr key={l.id} className={isDue(l) ? "due" : ""}>
                        <td data-l="Person"><b>{l.name || "(no name)"}</b><span className={`tag k-${l.kind}`}>{l.kind}</span><div className="m">{[l.designation, l.company].filter(Boolean).join(", ")}</div>{l.products && <div className="m">{l.kind === "Vendor" ? "Supplies: " : ""}{l.products}</div>}</td>
                        <td data-l="Contact"><div>{l.phones}</div><div className="m">{l.email}</div><div className="m">{(() => { const p = meta.get(l.id)?.place; return p ? [p.city, p.state, p.country].filter(Boolean).join(", ") : ""; })()}</div></td>
                        <td data-l="Met"><div>{lv.label}</div>{lv.more > 0 && <div className="m">+{lv.more} earlier meeting{lv.more > 1 ? "s" : ""}</div>}</td>
                        <td data-l="Interest">
                          <select aria-label="Interest" value={l.interest} onChange={(e) => void patchLead(l.id, { interest: e.target.value as Lead["interest"] })}>
                            <option value="">—</option><option>Hot</option><option>Warm</option><option>Cold</option>
                          </select>
                        </td>
                        <td data-l="Stage">
                          <select aria-label="Stage" value={l.stage} onChange={(e) => void patchLead(l.id, { stage: e.target.value })}>
                            {stagesFor(l.kind).map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td data-l="Follow-up">{l.followUp && <>{fmtDate(l.followUp)}{isDue(l) && <b className="duetxt"> due</b>}</>}</td>
                        <td data-l="Notes"><div className="clip">{l.notes}</div></td>
                        <td data-l=""><Actions l={l} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </section>
      </main>

      {edit && (
        <div className="ov full" role="dialog" aria-modal="true" aria-labelledby="edH">
          <div className="sheet review-sheet">
            <div className="rv-head">
              <h2 id="edH">Edit {edit.v.name || edit.v.company || "card"}</h2>
              <button type="button" className="btn" onClick={() => setEdit(null)}>Close</button>
            </div>
            <div className="rv-grid">
            <div className="rv-photos">
              <PhotoPanel front={photos?.front || ""} back={photos?.back || ""} loading={!photos} />
              {photos && !photos.stored && photos.front && <p className="m">Only a small thumbnail is kept for this card.</p>}
              {photos?.stored && (
                <div className="acts" style={{ marginTop: 8 }}>
                  {confirmPhotoDel ? (
                    <>
                      <button type="button" className="btn danger" onClick={() => {
                        void deletePhotos(edit.id);
                        setPhotos({ front: leads.find((x) => x.id === edit.id)?.thumb || "", back: "", stored: false });
                        setConfirmPhotoDel(false);
                      }}>Yes, delete photo</button>
                      <button type="button" className="btn" onClick={() => setConfirmPhotoDel(false)}>Keep</button>
                    </>
                  ) : (
                    <button type="button" className="btn danger-txt" onClick={() => setConfirmPhotoDel(true)}>Delete photo (checked)</button>
                  )}
                </div>
              )}
              <p className="m">First scanned {fmtDayShort(leads.find((x) => x.id === edit.id)?.createdAt || 0)}</p>
            </div>
            <div className="rv-form">
            <LeadFields value={edit.v} onChange={(v) => setEdit({ ...edit, v })} settings={settings} showStage />
            <div className="row">
              <a className="btn wa" href={editLink || undefined} aria-disabled={!editLink} target="_blank" rel="noopener noreferrer"
                onClick={(e) => {
                  if (!editLink) return e.preventDefault();
                  void patchLead(edit.id, { ...edit.v, waSent: Date.now(), stage: edit.v.stage === "New" ? "Contacted" : edit.v.stage });
                  setEdit(null);
                }}>WhatsApp</a>
              {pdfOk(edit.v.kind) && <button className="btn wa-out" onClick={() => {
                const e = edit;
                void share(e.v).then((ok) => { if (ok) { void patchLead(e.id, { ...e.v, waSent: Date.now(), stage: e.v.stage === "New" ? "Contacted" : e.v.stage }); setEdit(null); } });
              }}>Send PDF</button>}
              <button className="btn pri" onClick={() => { void patchLead(edit.id, edit.v); setEdit(null); }}>Save changes</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            </div>
            <div className="row"><button className="btn danger-txt" onClick={() => { setConfirmDel(leads.find((x) => x.id === edit.id) || null); setEdit(null); }}>Delete card</button></div>
            </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="ov" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>Delete this card?</h2>
            <p>{confirmDel.name || confirmDel.company || "This card"} will be removed for good.</p>
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
