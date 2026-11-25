"use client";
import { STAGES, TEXT_FIELDS, type Interest, type LeadFields as Fields } from "@/lib/leads";

/** All editable fields of a lead; used by the scan form and the dashboard editor. */
export default function LeadFields({
  value, onChange, showStage,
}: {
  value: Fields;
  onChange: (v: Fields) => void;
  showStage?: boolean;
}) {
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid">
      {TEXT_FIELDS.map((f) => (
        <label key={f.key} className={"f" + (f.full ? " full" : "")}>
          {f.label}
          <input
            type={f.type === "email" ? "email" : "text"}
            inputMode={f.type === "tel" ? "tel" : undefined}
            value={value[f.key] as string}
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
        <>
          <label className="f">Stage
            <select value={value.stage} onChange={(e) => set("stage", e.target.value as Fields["stage"])}>
              {STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="f">Follow-up date
            <input type="date" value={value.followUp} onChange={(e) => set("followUp", e.target.value)} />
          </label>
        </>
      )}
      <label className="f full">My notes (what they want, quantities, follow-up)
        <textarea value={value.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
    </div>
  );
}
