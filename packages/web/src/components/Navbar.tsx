import React, { useState } from "react";
import { RotateCcw, Mic } from "lucide-react";

interface NavbarProps {
  onReset: () => void;
  austinTime: string;
  onOpenVoiceModal?: () => void;
  activeView?: "dispatch" | "team" | "services" | "company" | "system";
  onViewChange?: (view: "dispatch" | "team" | "services" | "company" | "system") => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onReset, austinTime, onOpenVoiceModal, activeView = "dispatch", onViewChange }) => {
  const [isResetting, setIsResetting] = useState(false);

  const handleResetClick = () => {
    setIsResetting(true);
    onReset();
    setTimeout(() => setIsResetting(false), 400);
  };

  return (
    <header className="app-navbar" style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 20px",
      borderBottom: "1px solid var(--border)",
      backgroundColor: "var(--surface)",
      position: "sticky",
      top: 0,
      zIndex: 40
    }}>
      {/* Brand & Operational Context (Section 14) */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff"
          }}>
            <img src="/favicon.svg" alt="" width="28" height="28" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
              DispatchAI
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 400 }}>
              Austin Operations
            </span>
          </div>
        </div>

      </div>

      <nav className="app-nav-links" aria-label="Main navigation">
        {([ ["dispatch", "Dispatch"], ["team", "Team"], ["services", "Services"], ["company", "Company"], ["system", "System"] ] as const).map(([view, label]) =>
          <button type="button" key={view} className={activeView === view ? "app-nav-link active" : "app-nav-link"} aria-current={activeView === view ? "page" : undefined} onClick={() => onViewChange?.(view)}>{label}</button>
        )}
      </nav>
      {/* Right Controls: Clock & Essential Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Voice Dispatcher Trigger Button */}
        {onOpenVoiceModal && (
          <button
            onClick={onOpenVoiceModal}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              backgroundColor: "var(--accent)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(59, 130, 246, 0.25)"
            }}
          >
            <Mic size={13} className="animate-pulse" />
            <span>Voice Dispatcher</span>
          </button>
        )}

        {/* Local Clock */}
        <div className="hide-on-mobile" style={{
          fontSize: "12px",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.01em"
        }}>
          {austinTime || "Austin Local Time"}
        </div>

        {/* Reset Demo Data (Secondary Button per Section 22) */}
        <button
          onClick={handleResetClick}
          disabled={isResetting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 10px",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "12px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "background-color 0.12s ease"
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-subtle)")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
        >
          <RotateCcw size={12} className={isResetting ? "animate-spin" : ""} color="var(--text-secondary)" />
          <span>Reset Demo</span>
        </button>
      </div>
    </header>
  );
};
