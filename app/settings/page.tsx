"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import Shell from "@/components/Shell";
import { DEFAULT_TEMPLATE, waLink } from "@/lib/leads";

export default function SettingsPage() {
  const { settings, saveSettings, user, logout } = useApp();
  const [tpl, setTpl] = useState(settings.tpl);
  const [cc, setCc] = useState(settings.cc);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setTpl(settings.tpl); setCc(settings.cc); }, [settings]);

  const preview = waLink({ name: "Ravi", company: "Ravi Foods", phones: "9876543210", whatsapp: "" }, { tpl, cc });

  return (
    <Shell>
      <main className="wrap narrow">
        <section>
          <h2>WhatsApp message</h2>
          <p className="muted">Sent to every buyer. <code>{"{name}"}</code> and <code>{"{company}"}</code> are filled in automatically. Add your phone, website or catalogue link.</p>
          <textarea className="tpl" value={tpl} onChange={(e) => { setTpl(e.target.value); setSaved(false); }} />
          <label className="f" style={{ marginTop: 12, maxWidth: 260 }}>Default country code (used when a number has none)
            <input inputMode="numeric" value={cc} onChange={(e) => { setCc(e.target.value.replace(/\D/g, "")); setSaved(false); }} />
          </label>
          <div className="row">
            <button className="btn pri" onClick={() => { void saveSettings({ tpl: tpl.trim() || DEFAULT_TEMPLATE, cc: cc || "91" }); setSaved(true); }}>Save</button>
            {preview && <a className="btn" href={preview} target="_blank" rel="noopener noreferrer">Preview in WhatsApp</a>}
            <button className="btn" onClick={() => { setTpl(DEFAULT_TEMPLATE); setSaved(false); }}>Reset to default</button>
          </div>
          <p className="status" role="status">{saved ? "Saved." : ""}</p>
        </section>
        <section>
          <h2>Account</h2>
          <p className="muted">Signed in as {user.email || user.uid}.</p>
          <div className="row"><button className="btn" onClick={logout}>Sign out</button></div>
        </section>
      </main>
    </Shell>
  );
}
