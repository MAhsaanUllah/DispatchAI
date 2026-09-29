import React, { useState, useRef, useEffect } from "react";
import { Send, AlertTriangle, Check, X, Activity, Bot, Bell } from "lucide-react";
import type { AgentState } from "@dispatchai/agent";
import type { LocalNotification } from "@dispatchai/shared";
import { EventTimeline } from "./EventTimeline.js";

interface AgentChatProps {
  state: AgentState;
  notifications: LocalNotification[];
  connected?: boolean | null;
  onSendMessage: (text: string) => Promise<void>;
  onConfirm: () => Promise<void>;
  onReject: () => void | Promise<void>;
  isLoading: boolean;
  activeTab: "chat" | "events" | "outbox";
  onTabChange: (tab: "chat" | "events" | "outbox") => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({
  state,
  notifications,
  connected = null,
  onSendMessage,
  onConfirm,
  onReject,
  isLoading,
  activeTab,
  onTabChange
}) => {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    { label: "Find Customer", text: "Look up customer Alicia Ramirez and view service records" },
    { label: "Check HVAC slots", text: "Check available HVAC technician slots in Austin-North for today" },
    { label: "Change request", text: "Wait, cancel that and tell me Carlos Mendoza's schedule instead" },
    { label: "Lookup WO-1001", text: "What is the current status and technician for work order wo_1001?" }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.history, state.pendingAction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const text = inputText.trim();
    setInputText("");
    await onSendMessage(text);
  };

  return (
    <div className="op-surface" style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      position: "relative"
    }}>
      <div className="agent-console-header">
        <div className="agent-console-heading">
          <div>
            <div className="agent-console-title">Dispatch Agent</div>
            <div className="agent-console-subtitle">Operations assistant</div>
          </div>
          <div className="agent-caller" title={state.customer ? `${state.customer.firstName} ${state.customer.lastName}` : undefined}>
            {state.customer ? `${state.customer.firstName} ${state.customer.lastName}` : "No active caller"}
          </div>
        </div>
        <div className="agent-console-tabs" role="tablist" aria-label="Dispatch console">
          <button type="button" role="tab" aria-selected={activeTab === "chat"} className={`agent-console-tab ${activeTab === "chat" ? "is-active" : ""}`} onClick={() => onTabChange("chat")}>
            <span className={`live-status-dot ${connected === true ? "is-online" : "is-offline"}`} aria-hidden="true" />
            <span>Agent</span>
            {state.pendingAction && <span className="agent-pending-dot" title="Confirmation pending" aria-hidden="true" />}
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "events"} className={`agent-console-tab ${activeTab === "events" ? "is-active" : ""}`} onClick={() => onTabChange("events")}>
            <Activity size={14} aria-hidden="true" />
            <span>Activity</span><span className="agent-tab-count">{state.events.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "outbox"} className={`agent-console-tab ${activeTab === "outbox" ? "is-active" : ""}`} onClick={() => onTabChange("outbox")}>
            <Bell size={14} aria-hidden="true" />
            <span>Outbox</span><span className="agent-tab-count">{notifications.length}</span>
          </button>
        </div>
      </div>

      {/* Main Console Body: Chat vs Activity Stream */}
      {activeTab === "chat" ? (
        <>
          {/* Messages / Conversation Area */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }}>
            {state.history.length === 0 ? (
              <div className="agent-empty-state">
                <div className="agent-empty-icon"><Bot size={22} aria-hidden="true" /></div>
                <h2>Ready to help dispatch</h2>
                <div className={`agent-connection-status ${connected === true ? "is-connected" : connected === false ? "is-disconnected" : ""}`} role="status">
                  <span className="agent-connection-dot" aria-hidden="true" />
                  {connected === true ? "Austin Dispatch Engine Connected" : connected === false ? "Dispatch Agent Unreachable" : "Checking dispatch agent…"}
                </div>
                <p>
                  {connected === false
                    ? "Start the local agent service to use chat and load live work orders."
                    : "Look up a customer, check availability, or ask about a work order."}
                </p>
                <div className="agent-suggestions" aria-label="Suggested requests">
                  {quickPrompts.map((chip) => (
                    <button key={chip.label} type="button" onClick={() => onSendMessage(chip.text)} disabled={isLoading} title={chip.text}>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              state.history.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignSelf: isUser ? "flex-end" : "flex-start",
                      maxWidth: "88%"
                    }}
                  >
                    <div style={{
                      fontSize: "10.5px",
                      color: "var(--text-tertiary)",
                      marginBottom: "2px",
                      alignSelf: isUser ? "flex-end" : "flex-start",
                      fontWeight: 500
                    }}>
                      {isUser ? "Dispatcher" : "DispatchAgent"}
                    </div>
                    <div style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      fontSize: "12.5px",
                      lineHeight: "1.45",
                      backgroundColor: isUser ? "var(--surface-subtle)" : "var(--surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)"
                    }}>
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}

            {/* Confirmation Banner (Section 31: BEFORE -> AFTER State) */}
            {state.pendingAction && (
              <div style={{
                backgroundColor: "var(--warning-soft)",
                border: "1px solid #FDE68A",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--warning)", fontSize: "11.5px", fontWeight: 600 }}>
                  <AlertTriangle size={13} />
                  <span>Confirmation Required</span>
                </div>

                <div style={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xs)",
                  padding: "8px 10px",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px"
                }}>
                  <div style={{ color: "var(--text-tertiary)", fontSize: "10.5px", fontWeight: 600, textTransform: "uppercase" }}>
                    Proposed Mutation
                  </div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                    {state.pendingAction.description}
                  </div>
                  {state.pendingAction.type && (
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      Action: {state.pendingAction.type.replace(/_/g, " ")}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={onConfirm}
                    disabled={isLoading}
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "5px 12px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <Check size={12} />
                    <span>Confirm</span>
                  </button>
                  <button
                    onClick={onReject}
                    disabled={isLoading}
                    style={{
                      backgroundColor: "var(--surface)",
                      color: "var(--danger)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "5px 10px",
                      fontSize: "11.5px",
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <X size={12} />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            )}

            {isLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "var(--text-secondary)", padding: "2px 0" }}>
                <span className="live-status-dot" />
                <span>Agent executing operational workflow...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="agent-composer">
            <label className="sr-only" htmlFor="dispatch-agent-message">Message Dispatch Agent</label>
            <input
              id="dispatch-agent-message"
              name="dispatch-agent-message"
              type="text"
              placeholder="Ask about a job or customer…"
              autoComplete="off"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              aria-label="Send message"
              title="Send message"
            >
              <Send size={17} aria-hidden="true" />
            </button>
          </form>
        </>
      ) : activeTab === "events" ? (
        <EventTimeline events={state.events} isEmbedded />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Booking notices are drafted locally. Email is sent only when a real address and provider are configured; check each notice's status.
          </div>
          {notifications.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>No notices queued yet.</div>
          ) : notifications.map((notice) => (
            <div key={notice.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px", background: "var(--surface)" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-primary)" }}>
                {notice.eventType} · {notice.audience} · {notice.channel || "INTERNAL"} · {notice.status}
              </div>
              {notice.recipientAddress ? <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>To: {notice.recipientAddress}</div> : null}
              {notice.subject ? <div style={{ fontSize: "11px", fontWeight: 600, marginTop: "4px" }}>{notice.subject}</div> : null}
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>{notice.message}</div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px" }}>{notice.createdAt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
