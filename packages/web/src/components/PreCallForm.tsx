import React, { useState } from "react";
import { ArrowRight, Mail, Mic2, User, X } from "lucide-react";

export interface VisitorDetails {
  name: string;
  email: string;
}

export function validateVisitorDetails(name: string, email: string): string | null {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  if (!trimmedName) {
    return "Please enter your name so the dispatcher knows who is calling.";
  }
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
    <div className="modal" role="dialog" aria-modal="true" aria-label="Start your DispatchAI voice call">
      <div className="modal__panel">
        <div className="modal__head">
          <span className="public__card-label">Before you call</span>
          <button className="modal__close" onClick={onCancel} aria-label="Close" type="button"><X size={16} aria-hidden="true" /></button>
        </div>
        <div>
          <h2 className="modal__title">Talk to the dispatcher now.</h2>
          <p className="modal__lede">Two quick details and you’re on a call. Your email is saved with a confirmed demo booking; delivery requires a configured sender.</p>
        </div>
        <form className="modal__form" onSubmit={submit} noValidate>
          <label className="field" htmlFor="visitorName">
            <span className="field__label">Your name</span>
            <div className="modal__row">
              <User size={15} aria-hidden="true" />
              <input
                id="visitorName"
                name="visitorName"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Ayesha Khan"
                autoComplete="name"
              />
            </div>
          </label>
          <label className="field" htmlFor="visitorEmail">
            <span className="field__label">Email for your booking confirmation</span>
            <div className="modal__row">
              <Mail size={15} aria-hidden="true" />
              <input
                id="visitorEmail"
                name="visitorEmail"
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          </label>
          {error && <p className="field__error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary">
            <Mic2 size={16} aria-hidden="true" /> Call now
          </button>
        </form>
        <p className="field__hint">The dispatcher confirms every booking out loud before anything is booked.</p>
      </div>
    </div>
  );
}
