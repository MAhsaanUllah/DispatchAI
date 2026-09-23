import React, { useState, useRef, useEffect } from "react";
import { Send, AlertTriangle, Check, X, Activity, Bot, Bell } from "lucide-react";
import type { AgentState } from "@dispatchai/agent";
import type { LocalNotification } from "@dispatchai/shared";
import { EventTimeline } from "./EventTimeline.js";

interface AgentChatProps {
  state: AgentState;
  notifications: LocalNotification[];
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
    { label: "Check HVAC", text: "Check available HVAC technician slots in Austin-North for today" },
    { label: "Interruption Test", text: "Wait, cancel that and tell me Carlos Mendoza's schedule instead" },
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
      {/* Integrated Console Header with In-Card Tabs (Section 24) */}
      <div style={{
        padding: "12px 18px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "var(--surface)",
        flexShrink: 0
      }}>
        {/* Left Segmented Tab Switcher */}
        <div style={{
          display: "flex",
          gap: "2px",
          backgroundColor: "var(--surface-subtle)",
          padding: "3px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)"
        }}>
          <button
            onClick={() => onTabChange("chat")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "var(--radius-xs)",
              border: "none",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              backgroundColor: activeTab === "chat" ? "var(--surface)" : "transparent",
              color: activeTab === "chat" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: activeTab === "chat" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
            }}
          >
            <span className="live-status-dot" />
            <span>Agent</span>
            {state.pendingAction && (
              <span style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "var(--warning)"
              }} />
            )}
          </button>

          <button
            onClick={() => onTabChange("events")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 12px",
              borderRadius: "var(--radius-xs)",
              border: "none",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              backgroundColor: activeTab === "events" ? "var(--surface)" : "transparent",
              color: activeTab === "events" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: activeTab === "events" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
            }}
          >
            <Activity size={12} color="var(--text-tertiary)" />
            <span>Activity ({state.events.length})</span>
          </button>
          <button
            onClick={() => onTabChange("outbox")}
            style={{
              display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px",
              borderRadius: "var(--radius-xs)", border: "none", fontSize: "12px", fontWeight: 500,
              cursor: "pointer", backgroundColor: activeTab === "outbox" ? "var(--surface)" : "transparent",
              color: activeTab === "outbox" ? "var(--text-primary)" : "var(--text-secondary)"
            }}
          >
            <Bell size={12} />
            <span>Outbox ({notifications.length})</span>
          </button>
        </div>

        {/* Right Active Customer Status */}
        {state.customer ? (
          <div style={{
            fontSize: "11.5px",
            padding: "3px 8px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--accent-soft)",
            color: "var(--accent)",
            border: "1px solid #BFDBFE"
          }}>
            Caller: <strong>{state.customer.firstName} {state.customer.lastName}</strong>
          </div>
        ) : (
          <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>No active caller</span>
        )}
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
              <div style={{
                textAlign: "center",
                padding: "28px 16px",
                color: "var(--text-secondary)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                gap: "8px"
              }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: "var(--surface-subtle)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent)"
                }}>
                  <Bot size={18} />
                </div>
                <div style={{ fontSize: "13.5px", color: "var(--text-primary)", fontWeight: 600 }}>
                  DispatchAgent Standing By
                </div>
                <div style={{
                  fontSize: "11px",
                  color: "var(--success)",
                  backgroundColor: "var(--success-soft)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-xs)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontWeight: 500
                }}>
                  <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--success)" }} />
                  Austin Dispatch Engine Connected
                </div>
                <p style={{ fontSize: "11.5px", maxWidth: "290px", color: "var(--text-secondary)", lineHeight: 1.5, marginTop: "2px" }}>
                  Ask to lookup customer records, reassign active technicians, check schedule availability, or process urgent dispatch overrides.
                </p>
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

          {/* Suggested Prompt Chips - Sleek Ghost Badges (Section 23) */}
          <div style={{
            padding: "7px 14px",
            borderTop: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "5px",
            backgroundColor: "var(--surface)",
            flexShrink: 0
          }}>
            {quickPrompts.map((chip, i) => (
              <button
                key={i}
                onClick={() => onSendMessage(chip.text)}
                disabled={isLoading}
                style={{
                  textAlign: "center",
                  fontSize: "11px",
                  fontWeight: 500,
                  backgroundColor: "var(--surface-subtle)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-xs)",
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  transition: "all 0.12s ease"
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-strong)";
                  e.currentTarget.style.color = "var(--text-primary)";
                  e.currentTarget.style.backgroundColor = "var(--surface)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.backgroundColor = "var(--surface-subtle)";
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Input Composer (Section 23) */}
          <form onSubmit={handleSubmit} style={{
            padding: "10px 16px 12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "8px",
            backgroundColor: "var(--surface)",
            flexShrink: 0
          }}>
            <input
              type="text"
              placeholder="Ask DispatchAgent (e.g. 'Reschedule WO-1001')..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
              style={{
                flex: 1,
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "7px 12px",
                color: "var(--text-primary)",
                fontSize: "12.5px",
                outline: "none"
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              style={{
                backgroundColor: "var(--text-primary)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "0 14px",
                color: "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: isLoading || !inputText.trim() ? 0.4 : 1
              }}
            >
              <Send size={13} />
            </button>
          </form>
        </>
      ) : activeTab === "events" ? (
        <EventTimeline events={state.events} isEmbedded />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Local pending notices only — no SMS or email has been sent.
          </div>
          {notifications.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>No notices queued yet.</div>
          ) : notifications.map((notice) => (
            <div key={notice.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px", background: "var(--surface)" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-primary)" }}>
                {notice.eventType} · {notice.audience} · {notice.status}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>{notice.message}</div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px" }}>{notice.createdAt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
