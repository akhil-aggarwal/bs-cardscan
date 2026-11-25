"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, type User,
} from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { asLead, DEFAULT_SETTINGS, type Lead, type Settings } from "@/lib/leads";

type Ctx = {
  user: User;
  leads: Lead[];
  loading: boolean;
  offline: boolean;
  settings: Settings;
  saveLead: (id: string, data: Omit<Lead, "id">) => Promise<void>;
  patchLead: (id: string, changes: Partial<Omit<Lead, "id">>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  logout: () => void;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

export function newLeadId() {
  return "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => (firebaseConfigured ? onAuthStateChanged(auth, setUser) : setUser(null)), []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const timer = setTimeout(() => setOffline(true), 10000);
    const unsubLeads = onSnapshot(
      query(collection(db, "leads"), orderBy("createdAt", "desc")),
      { includeMetadataChanges: true },
      (snap) => {
        setLeads(snap.docs.map((d) => asLead(d.id, d.data())));
        setLoading(false);
        if (!snap.metadata.fromCache) {
          clearTimeout(timer);
          setOffline(false);
        }
      },
      (err) => {
        console.error(err);
        clearTimeout(timer);
        setLoading(false);
        setOffline(true);
      },
    );
    const unsubSet = onSnapshot(doc(db, "settings", "main"), (s) => {
      const d = s.data();
      if (d) setSettings({ tpl: typeof d.tpl === "string" && d.tpl ? d.tpl : DEFAULT_SETTINGS.tpl, cc: typeof d.cc === "string" && d.cc ? d.cc : "91" });
    }, () => {});
    return () => {
      clearTimeout(timer);
      unsubLeads();
      unsubSet();
    };
  }, [user]);

  const value = useMemo<Ctx | null>(() => {
    if (!user) return null;
    return {
      user, leads, loading, offline, settings,
      // Writes resolve once queued locally; Firestore syncs them when the network is back.
      saveLead: async (id, data) => {
        void setDoc(doc(db, "leads", id), data);
      },
      patchLead: async (id, changes) => {
        void setDoc(doc(db, "leads", id), { ...changes, updatedAt: Date.now() }, { merge: true });
      },
      deleteLead: async (id) => {
        void deleteDoc(doc(db, "leads", id));
      },
      saveSettings: async (s) => {
        setSettings(s);
        void setDoc(doc(db, "settings", "main"), s);
      },
      logout: () => void signOut(auth),
    };
  }, [user, leads, loading, offline, settings]);

  if (!firebaseConfigured) {
    return (
      <div className="center">
        <div className="card">
          <h1>Almost there</h1>
          <p>Firebase settings are missing. Add the <code>NEXT_PUBLIC_FIREBASE_…</code> values from <code>.env.example</code> to your hosting settings (or <code>.env.local</code>) and redeploy.</p>
        </div>
      </div>
    );
  }
  if (user === undefined) return <div className="center"><p className="muted">Loading…</p></div>;
  if (!user || !value) return <Login />;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => {
    const code = (e as { code?: string })?.code || "";
    setErr(
      code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")
        ? "Email or password is wrong."
        : code.includes("popup")
          ? "Google sign-in was closed. Try again."
          : "Could not sign in. Check your internet and try again.",
    );
    setBusy(false);
  };
  return (
    <div className="center">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          signInWithEmailAndPassword(auth, email.trim(), pw).catch(fail);
        }}
      >
        <div className="brandmark">Card Scanner</div>
        <h1>Sign in</h1>
        <p className="muted">Your Indusfood leads are private to your account.</p>
        <button type="button" className="btn" disabled={busy} onClick={() => { setBusy(true); setErr(""); signInWithPopup(auth, new GoogleAuthProvider()).catch(fail); }}>
          Continue with Google
        </button>
        <p className="or">or</p>
        <label className="f">Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="f">Password<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        <button className="btn pri" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        {err && <p className="status err">{err}</p>}
      </form>
    </div>
  );
}
