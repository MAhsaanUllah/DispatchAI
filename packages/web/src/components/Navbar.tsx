import React, { useState } from "react";
import { Radio, RotateCcw, ChevronDown, CheckCircle2, Server, Database, Cpu, Mic } from "lucide-react";

interface NavbarProps {
  onReset: () => void;
  austinTime: string;
  onOpenVoiceModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onReset, austinTime, onOpenVoiceModal }) => {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);

  const handleResetClick = () => {
    setIsResetting(true);
    onReset();
    setTimeout(() => setIsResetting(false), 400);
  };

  return (
    <header style={{
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
            <Radio size={15} />
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

        {/* Quiet Connection State (Section 14 & 41) */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            aria-label="Toggle system diagnostics"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: isDisconnected ? "rgba(239, 68, 68, 0.15)" : "var(--surface-subtle)",
              border: `1px solid ${isDisconnected ? "var(--error)" : "var(--border)"}`,
              fontSize: "12px",
              color: isDisconnected ? "var(--error)" : "var(--text-secondary)",
              cursor: "pointer"
            }}
          >
            <span className={isDisconnected ? "" : "live-status-dot"} style={isDisconnected ? { width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--error)" } : {}} />
            <span style={{ color: isDisconnected ? "var(--error)" : "var(--text-primary)", fontWeight: 500 }}>
              {isDisconnected ? "Agent Disconnected" : "Agent connected"}
            </span>
            <ChevronDown size={12} color="var(--text-tertiary)" />
          </button>

          {/* Secondary Diagnostics Surface */}
          {showDiagnostics && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              width: "260px",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-drawer)",
              padding: "10px 12px",
              zIndex: 50,
              fontSize: "11.5px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}>
              <div style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                System Diagnostics & Resilience
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)" }}>
                  <Cpu size={12} /> Local DispatchAgent
                </span>
                <span style={{ color: isDisconnected ? "var(--error)" : "var(--success)", fontWeight: 500 }}>
                  {isDisconnected ? "Offline" : "Active"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)" }}>
                  <Server size={12} /> n8n Automation
                </span>
                <span style={{ color: isDisconnected ? "var(--error)" : "var(--success)", fontWeight: 500 }}>
                  {isDisconnected ? "Reconnecting..." : "Connected"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)" }}>
                  <Database size={12} /> Bounded Retries
                </span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Max 3 Retries (5s)</span>
              </div>

              <button
                onClick={() => setIsDisconnected(!isDisconnected)}
                style={{
                  marginTop: "4px",
                  padding: "6px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: isDisconnected ? "var(--accent)" : "var(--surface-subtle)",
                  border: "1px solid var(--border)",
                  color: isDisconnected ? "#ffffff" : "var(--text-primary)",
                  fontWeight: 500,
                  fontSize: "11px",
                  cursor: "pointer",
                  textAlign: "center"
                }}
              >
                {isDisconnected ? "Restore Reconnect Stream" : "Simulate Outage Disconnect"}
              </button>
            </div>
          )}
        </div>
      </div>

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
