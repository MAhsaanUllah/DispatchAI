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

  const speak = async (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => undefined;
    utterance.onerror = () => undefined;
    window.speechSynthesis.speak(utterance);
  };

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
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="testcall-title">
      <div className="modal__panel">
        <div className="modal__head">
          <h2 className="modal__title" id="testcall-title">Test call</h2>
          <button type="button" onClick={() => { stop(); onClose(); }} aria-label="Close test call" className="modal__close">×</button>
        </div>
        <p className="modal__lede">
          Talk to your agent like a caller would. Bookings made here are real bookings in your dashboard.
          {!speechSupported && " This browser has no speech recognition (try Chrome or Edge); type instead."}
        </p>
        <div aria-live="polite" className="modal__transcript">
          {lines.length === 0 && <p className="field__hint">Press Start and speak, or type a message.</p>}
          {lines.map((line, i) => (
            <div key={i} className={`message ${line.who === "you" ? "message--out" : ""}`}>
              <span className="sr-only">{line.who === "you" ? "You: " : "Agent: "}</span>
              <div className="message__body">{line.text}</div>
            </div>
          ))}
        </div>
        {error && <p role="alert" className="field__error">{error}</p>}
        <div className="modal__foot">
          {speechSupported && (callOn
            ? <button type="button" className="btn btn--danger" onClick={stop}>End call</button>
            : <button type="button" className="btn btn--primary" onClick={start}>Start</button>)}
          <span className="field__hint">{busy ? "Agent is thinking…" : listening ? "Listening…" : ""}</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(typed); setTyped(""); }} className="modal__row">
          <input className="input" aria-label="Type a message" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type what the caller says…" />
          <button type="submit" className="btn" disabled={busy}>Send</button>
        </form>
      </div>
    </div>
  );
}
