"use client";
import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { logError } from "@/lib/log";
import { today } from "@/lib/leads";
import { WavRecorder } from "@/lib/wav";

type SRResult = { isFinal: boolean; 0: { transcript: string; confidence: number } };
type SR = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<SRResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

const getSR = (): (new () => SR) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const MAX_SECONDS = 60;
type Mode = "idle" | "listening" | "review" | "recording" | "sending";

/**
 * Mic for the notes box.
 * 1. Free: the phone's own speech-to-text (Indian English).
 * 2. If that comes out unclear, or the Hinglish switch is on, "Smart voice" records and asks Gemini.
 */
export type VoiceResult = { text: string; followUp?: string; interest?: "Hot" | "Warm" | "Cold" };

export default function VoiceNote({ onResult }: { onResult: (r: VoiceResult) => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [hinglish, setHinglish] = useState(false);
  const [live, setLive] = useState("");
  const [msg, setMsg] = useState("");
  const [secs, setSecs] = useState(0);
  const [hasSR, setHasSR] = useState(false);
  const cb = useRef(onResult);
  cb.current = onResult; // always use the latest form values when a slow recording finishes
  const recRef = useRef<SR | null>(null);
  const wavRef = useRef<WavRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setHasSR(!!getSR());
    try { setHinglish(localStorage.getItem("voice-hinglish") === "1"); } catch { /* ignore */ }
    return () => { recRef.current?.abort(); wavRef.current?.cancel(); if (timerRef.current) clearInterval(timerRef.current); };
  }, []);
  const toggleHinglish = () => {
    const v = !hinglish;
    setHinglish(v);
    try { localStorage.setItem("voice-hinglish", v ? "1" : "0"); } catch { /* ignore */ }
  };

  /* ---------- 1. free phone dictation ---------- */
  function startPhone() {
    const SRC = getSR();
    if (!SRC) return void startSmart();
    const rec = new SRC();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "", conf = 0, n = 0, failed = false;
    rec.onresult = (e) => {
      let interim = "";
      finalText = ""; conf = 0; n = 0;
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalText += r[0].transcript + " "; if (r[0].confidence > 0) { conf += r[0].confidence; n++; } }
        else interim += r[0].transcript;
      }
      setLive((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      failed = true;
      if (e.error === "no-speech") setMsg("Didn't hear anything. Tap the mic and speak again.");
      else if (e.error === "not-allowed" || e.error === "service-not-allowed") setMsg("Microphone is blocked. Allow it in your browser settings, or use the keyboard mic.");
      else if (e.error === "aborted") setMsg("");
      else {
        setMsg("Phone dictation didn't work here — try Smart voice.");
        logError("voice: phone dictation", e.error);
      }
      setMode("idle");
    };
    rec.onend = () => {
      recRef.current = null;
      if (failed) return;
      const text = finalText.trim();
      const avg = n ? conf / n : 1;
      const unclear = !text || /[ऀ-ॿ]/.test(text) || avg < 0.6;
      if (!text) { setMode("idle"); setMsg("Didn't catch that. Tap the mic and speak again."); return; }
      if (unclear) { setLive(text); setMode("review"); return; }
      cb.current({ text });
      setLive("");
      setMode("idle");
      setMsg("Added to notes.");
    };
    recRef.current = rec;
    setMsg("");
    setLive("");
    setMode("listening");
    try { rec.start(); } catch (e) { logError("voice: start dictation", e); setMode("idle"); startSmart(); }
  }

  /* ---------- 2. Smart voice (Gemini) ---------- */
  async function startSmart() {
    setMsg("");
    setLive("");
    const r = new WavRecorder();
    try {
      await r.start();
    } catch (e) {
      logError("voice: microphone", e);
      setMsg("Couldn't use the microphone. Allow it in your browser settings.");
      setMode("idle");
      return;
    }
    wavRef.current = r;
    setSecs(0);
    setMode("recording");
    const started = Date.now();
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSecs(s);
      if (s >= MAX_SECONDS) void stopSmart();
    }, 250);
  }

  async function stopSmart() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const r = wavRef.current;
    wavRef.current = null;
    if (!r) return;
    setMode("sending");
    try {
      const { base64, seconds } = await r.stop();
      if (seconds < 0.7) { setMode("idle"); setMsg("That was too short. Hold on a moment longer while you speak."); return; }
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ audio: base64, today: today() }),
      });
      const data = await res.json().catch(() => ({ error: "Unexpected reply from the server." }));
      if (!res.ok) {
        logError("voice: smart voice", data.error, { status: res.status, detail: data.detail });
        throw new Error(data.error || "Smart voice failed.");
      }
      if (!data.note) { setMsg("Couldn't make out the recording. Try again in a quieter spot."); setMode("idle"); return; }
      const f: VoiceResult = { text: data.note };
      if (data.followUp) f.followUp = data.followUp;
      if (data.interest) f.interest = data.interest;
      cb.current(f);
      const extra = [f.followUp && `follow-up ${new Date(f.followUp + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, f.interest].filter(Boolean).join(", ");
      setMsg("Added to notes" + (extra ? ` · also set ${extra}` : "") + ".");
      setMode("idle");
    } catch (e) {
      setMsg((e as Error).message || "Smart voice failed. Try again.");
      setMode("idle");
    }
  }

  function onMic() {
    if (mode === "listening") return recRef.current?.stop();
    if (mode === "recording") return void stopSmart();
    if (mode === "sending") return;
    if (hinglish || !hasSR) void startSmart();
    else startPhone();
  }

  const label =
    mode === "listening" ? "Listening… tap to stop"
      : mode === "recording" ? `Recording ${secs}s… tap to stop`
        : mode === "sending" ? "Writing note…"
          : hinglish || !hasSR ? "Speak note (Smart voice)" : "Speak note";

  return (
    <div className="voice">
      <div className="voice-row">
        <button type="button" className={"btn mic" + (mode === "listening" || mode === "recording" ? " on" : "")} onClick={onMic} disabled={mode === "sending" || mode === "review"} aria-live="polite">
          {mode === "sending" ? <span className="spin dark" /> : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          )}
          {label}
        </button>
        {hasSR && (
          <label className="check small-check">
            <input type="checkbox" checked={hinglish} onChange={toggleHinglish} disabled={mode !== "idle"} /> Hindi / Hinglish
          </label>
        )}
      </div>
      {mode === "listening" && live && <p className="m live">{live}</p>}
      {mode === "review" && (
        <div className="review">
          <p className="m">Didn&apos;t come out clearly: <b>“{live}”</b></p>
          <div className="acts">
            <button type="button" className="btn pri" onClick={() => { setMode("idle"); void startSmart(); }}>Use Smart voice</button>
            <button type="button" className="btn" onClick={() => { cb.current({ text: live }); setLive(""); setMode("idle"); setMsg("Added to notes."); }}>Add anyway</button>
            <button type="button" className="btn" onClick={() => { setLive(""); setMode("idle"); }}>Discard</button>
          </div>
        </div>
      )}
      {msg && mode === "idle" && <p className="m">{msg}</p>}
      {!hasSR && mode === "idle" && !msg && <p className="m">This browser has no built-in dictation, so notes use Smart voice.</p>}
    </div>
  );
}
