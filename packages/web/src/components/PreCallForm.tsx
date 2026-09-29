import React, { useState } from "react";
import { ArrowRight, Mail, Mic2, User, X } from "lucide-react";

export interface VisitorDetails {
  name: string;
  email: string;
}

export function validateVisitorDetails(name: string, email: string): string | null {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  if (!trimmedName) return "Please enter your name so the dispatcher knows who is calling.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return "Please enter a valid email address for your booking confirmation.";
  }
  return null;
}

interface PreCallFormProps {
  isOpen: boolean;
  initialName?: string;
  initialEmail?: string;
  onCancel: () => void;
  onStart: (visitor: VisitorDetails) => void;
}

export function PreCallForm({ isOpen, initialName = "", initialEmail = "", onCancel, onStart }: PreCallFormProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  if (!isOpen) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateVisitorDetails(name, email);
    if (validation) {
      setError(validation);
      return;
    }
    onStart({ name: name.trim(), email: email.trim() });
  };

  return (
    <div className="voice-backdrop" role="dialog" aria-modal="true" aria-label="Start your DispatchAI voice call">
      <div className="precall-panel">
        <div className="precall-head">
          <span className="precall-eyebrow">BEFORE YOU CALL</span>
          <button className="voice-close" onClick={onCancel} aria-label="Close" type="button"><X size={18} /></button>
        </div>
        <div className="precall-intro">
          <img src="/dispatch-agent-avatar.png" alt="" width="56" height="56" />
          <div>
            <strong>Talk to the dispatcher now.</strong>
            <p>Two quick details and you're on a call. Your email is saved with a confirmed demo booking; delivery requires a configured sender.</p>
          </div>
        </div>
        <form className="precall-form" onSubmit={submit} noValidate>
          <label className="precall-label" htmlFor="visitorName">Your name</label>
          <div className="precall-field">
            <User size={15} aria-hidden="true" />
            <input
              id="visitorName"
              name="visitorName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ayesha Khan"
              autoComplete="name"
            />
          </div>
          <label className="precall-label" htmlFor="visitorEmail">Email for your booking confirmation</label>
          <div className="precall-field">
            <Mail size={15} aria-hidden="true" />
            <input
              id="visitorEmail"
              name="visitorEmail"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          {error && <p className="precall-error" role="alert">{error}</p>}
          <button type="submit" className="landing-primary-cta precall-cta">
            <Mic2 size={16} aria-hidden="true" /> Call now <ArrowRight size={15} aria-hidden="true" />
          </button>
        </form>
        <p className="precall-footnote">The dispatcher confirms every booking out loud before anything is booked.</p>
      </div>
    </div>
  );
}
