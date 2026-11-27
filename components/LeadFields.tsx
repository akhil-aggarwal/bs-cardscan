"use client";
import { fmtDay, stagesFor, TEXT_FIELDS, type Interest, type Kind, type LeadFields as Fields, type Settings } from "@/lib/leads";
import VoiceNote from "./VoiceNote";

/** All editable fields of a lead; used by the scan form and the dashboard editor. */
export default function LeadFields({
  value, onChange, settings, showStage,
}: {
  value: Fields;
  onChange: (v: Fields) => void;
  settings: Settings;
  showStage?: boolean;
}) {
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => onChange({ ...value, [k]: v });
  const vendor = value.kind === "Vendor";

  const setKind = (k: Kind) => {
    if (k === value.kind) return;
    const stage = stagesFor(k).includes(value.stage) ? value.stage : "New";
    onChange({ ...value, kind: k, stage });
  };
  const setVisitEx = (i: number, ex: string) => set("visits", value.visits.map((v, j) => (j === i ? { ...v, ex } : v)));

  return (
    <div className="grid">
      <div className="f full">
        <span>This card is a</span>
        <div className="chips kind">
          <button type="button" aria-pressed={!vendor} onClick={() => setKind("Buyer")}>Buyer <small>buys from you</small></button>
          <button type="button" aria-pressed={vendor} onClick={() => setKind("Vendor")}>Vendor <small>sells to you</small></button>
        </div>
      </div>

      {value.visits.map((v, i) => (
        <label key={i} className="f">
          {value.visits.length > 1 ? `Met on ${fmtDay(v.at)} at` : `Exhibition · ${fmtDay(v.at)}`}
          <select value={v.ex} onChange={(e) => setVisitEx(i, e.target.value)}>
            {settings.exhibitions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="">No exhibition</option>
            {v.ex && !settings.exhibitions.some((x) => x.id === v.ex) && <option value={v.ex}>Unknown exhibition</option>}
          </select>
        </label>
      ))}

      {TEXT_FIELDS.map((f) => (
        <label key={f.key} className={"f" + (f.full ? " full" : "")}>
          {vendor && f.vendorLabel ? f.vendorLabel : f.label}
          <input
            type={f.type === "email" ? "email" : "text"}
            inputMode={f.type === "tel" ? "tel" : undefined}
            value={value[f.key] as string}
            placeholder={vendor && f.key === "products" ? "e.g. packaging pouches, spices" : undefined}
            onChange={(e) => set(f.key, e.target.value as never)}
          />
        </label>
      ))}
      <div className="f full">
        <span>Interest</span>
        <div className="chips">
          {(["Hot", "Warm", "Cold"] as Interest[]).map((v) => (
            <button key={v} type="button" aria-pressed={value.interest === v} onClick={() => set("interest", value.interest === v ? "" : v)}>{v}</button>
          ))}
        </div>
      </div>
      {showStage && (
        <label className="f">Stage
          <select value={value.stage} onChange={(e) => set("stage", e.target.value)}>
            {stagesFor(value.kind).map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      )}
      <label className="f">Follow-up date
        <input type="date" value={value.followUp} onChange={(e) => set("followUp", e.target.value)} />
      </label>
      <div className="f full">
        <label className="f" htmlFor="notes-box">My notes ({vendor ? "what they offer, rates, MOQ" : "what they want, quantities, follow-up"})</label>
        <textarea id="notes-box" value={value.notes} onChange={(e) => set("notes", e.target.value)} />
        <VoiceNote
          onResult={(r) => onChange({
            ...value,
            notes: value.notes.trim() ? `${value.notes.trim()} ${r.text}` : r.text,
            ...(r.followUp ? { followUp: r.followUp } : {}),
            ...(r.interest ? { interest: r.interest } : {}),
          })}
        />
      </div>
    </div>
  );
}
