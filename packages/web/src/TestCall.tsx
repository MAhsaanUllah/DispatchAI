import React, { useEffect, useRef, useState } from "react";

type Props = { isOpen: boolean; onClose: () => void; onTurn: () => void };
type Line = { who: "you" | "agent"; text: string };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };

const SpeechRecognitionImpl = (): (new () => Recognition) | undefined =>
  (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

// Owner "Test call": talk to your own agent in the browser (Web Speech API), same engine as the phone line.
// Each call is a fresh conversation. Typing works too (and is the fallback where speech is not supported).
export function TestCall({ isOpen, onClose, onTurn }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [callOn, setCallOn] = useState(false);
  const session = useRef("");
  const recognition = useRef<Recognition | null>(null);
  const active = useRef(false);
  const speechSupported = typeof window !== "undefined" && !!SpeechRecognitionImpl();

  useEffect(() => {
    if (!isOpen) return;
    session.current = `testcall_${crypto.randomUUID()}`;
    setLines([]);
    setError("");
    return () => stop();
  }, [isOpen]);

  const speak = (text: string) => new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });

  const send = async (text: string) => {
    if (!text.trim()) return;
    setLines((current) => [...current, { who: "you", text }]);
    setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": session.current }, body: JSON.stringify({ message: text }) });
      const body = await response.json();
      const reply: string = body.reply ?? body.error?.message ?? body.error ?? "Sorry, something went wrong.";
      setLines((current) => [...current, { who: "agent", text: reply }]);
      onTurn();
      await speak(reply);
    } catch {
      setError("Cannot reach the DispatchAI server.");
    } finally {
      setBusy(false);
    }
    if (active.current) listen();
  };

  const listen = () => {
    const Impl = SpeechRecognitionImpl();
    if (!Impl) return;
    const rec = new Impl();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript ?? "";
      rec.onend = null;
      setListening(false);
      void send(text);
    };
    rec.onend = () => {
      setListening(false);
      if (active.current) listen(); // silence: keep listening while the call is on
    };
    rec.onerror = (event) => {
      if (event?.error === "not-allowed") {
        setError("Microphone permission was denied. Allow it in the browser, or type below.");
        active.current = false;
      }
    };
    recognition.current = rec;
    setListening(true);
    rec.start();
  };

  const start = async () => {
    active.current = true;
    setCallOn(true);
    setError("");
    await speak("Hello, thanks for calling. How can I help you today?");
    listen();
  };

  function stop() {
    active.current = false;
    setCallOn(false);
    recognition.current?.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setListening(false);
  }

  if (!isOpen) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="testcall-title" style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.3)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, display: "grid", gap: 12, padding: 20, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="testcall-title" style={{ margin: 0, fontSize: 18 }}>Test call</h2>
          <button type="button" onClick={() => { stop(); onClose(); }} aria-label="Close test call" style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          Talk to your agent like a caller would. Bookings made here are real bookings in your dashboard.
          {!speechSupported && " This browser has no speech recognition (try Chrome or Edge); type instead."}
        </p>
        <div aria-live="polite" style={{ display: "grid", gap: 6, maxHeight: 280, overflowY: "auto", padding: 8, borderRadius: 8, background: "var(--surface-subtle, #f5f5f4)", minHeight: 80 }}>
          {lines.length === 0 && <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Press Start and speak, or type a message.</span>}
          {lines.map((line, i) => (
            <div key={i} style={{ justifySelf: line.who === "you" ? "end" : "start", maxWidth: "85%", padding: "6px 10px", borderRadius: 8, fontSize: 14, background: line.who === "you" ? "var(--accent-soft)" : "var(--surface)" }}>
              <span className="sr-only">{line.who === "you" ? "You: " : "Agent: "}</span>{line.text}
            </div>
          ))}
        </div>
        {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {speechSupported && (callOn
            ? <button type="button" onClick={stop} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--danger)", background: "var(--danger)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>End call</button>
            : <button type="button" onClick={start} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Start</button>)}
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{busy ? "Agent is thinking…" : listening ? "Listening…" : ""}</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(typed); setTyped(""); }} style={{ display: "flex", gap: 8 }}>
          <input aria-label="Type a message" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type what the caller says…" style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)" }} />
          <button type="submit" disabled={busy} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}>Send</button>
        </form>
      </div>
    </div>
  );
}
