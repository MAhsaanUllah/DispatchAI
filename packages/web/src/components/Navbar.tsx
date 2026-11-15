import React, { useState } from "react";
import { RotateCcw, Mic } from "lucide-react";

interface NavbarProps {
  onReset: () => void;
  austinTime: string;
  onOpenVoiceModal?: () => void;
  activeView?: "dispatch" | "team" | "services" | "company" | "system" | "plugins" | "inbox";
  onViewChange?: (view: "dispatch" | "team" | "services" | "company" | "system" | "plugins" | "inbox") => void;
  onLogout?: () => void;
  companyName?: string;
  // Staff see a reduced navbar; the server enforces the same rules.
  isOwner?: boolean;
  // "Reset Demo" only means something while the install still runs on the fictional dataset.
  demo?: boolean;
}

const VIEWS = [
  ["dispatch", "Dispatch"],
  ["inbox", "Inbox"],
  ["team", "Team"],
  ["services", "Services"],
  ["company", "Company"],
  ["plugins", "Plugins"],
  ["system", "System"]
] as const;

export const Navbar: React.FC<NavbarProps> = ({ onReset, austinTime, onOpenVoiceModal, activeView = "dispatch", onViewChange, onLogout, companyName, isOwner = true, demo = false }) => {
  const [isResetting, setIsResetting] = useState(false);

  const handleResetClick = () => {
    setIsResetting(true);
    onReset();
    setTimeout(() => setIsResetting(false), 400);
  };

  return (
    <header className="app-nav">
      <div className="app-nav__brand">
        <span className="app-nav__mark"><img src="/favicon.svg" alt="" width="18" height="18" /></span>
        <span className="app-nav__name">DispatchAI</span>
        {companyName && <span className="app-nav__company">{companyName}</span>}
      </div>

      <nav className="app-nav__links" aria-label="Main">
        {VIEWS.filter(([view]) => isOwner || view !== "plugins").map(([view, label]) => (
          <button type="button" key={view} className="nav-cell" aria-current={activeView === view ? "page" : undefined} onClick={() => onViewChange?.(view)}>{label}</button>
        ))}
      </nav>

      <div className="app-nav__tools">
        {onOpenVoiceModal && (
          <button type="button" className="btn btn--primary btn--sm" onClick={onOpenVoiceModal}>
            <Mic size={13} aria-hidden="true" />
            Test call
          </button>
        )}
        <span className="app-clock">{austinTime || "Local time"}</span>
        {isOwner && demo && (
          <button type="button" className="btn btn--quiet btn--sm" onClick={handleResetClick} disabled={isResetting}>
            <RotateCcw size={12} aria-hidden="true" />
            Reset Demo
          </button>
        )}
        {onLogout && (
          <button type="button" className="btn btn--quiet btn--sm" onClick={onLogout}>Log out</button>
        )}
      </div>
    </header>
  );
};
