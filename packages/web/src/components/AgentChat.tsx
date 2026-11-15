import React, { useState, useRef, useEffect } from "react";
import { Send, AlertTriangle, Check, X, Activity, Bell } from "lucide-react";
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
    <div className="panel console">
      <div className="console__tabs" role="tablist" aria-label="Dispatch console">
        <button type="button" role="tab" aria-selected={activeTab === "chat"} className="tab" onClick={() => onTabChange("chat")}>
          <span>Agent</span>
          {state.pendingAction && <span className="swatch swatch--attention" aria-hidden="true" />}
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "events"} className="tab" onClick={() => onTabChange("events")}>
          <Activity size={13} aria-hidden="true" />
          <span>Activity</span>
          <span className="tab__count">{state.events.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "outbox"} className="tab" onClick={() => onTabChange("outbox")}>
          <Bell size={13} aria-hidden="true" />
          <span>Outbox</span>
          <span className="tab__count">{notifications.length}</span>
        </button>
      </div>

      {activeTab === "chat" ? (
        <>
          <div className="console__body">
            {state.history.length === 0 ? (
              <div className="console__empty">
                <h2 className="console__empty-title">Ready to help dispatch</h2>
                <div
                  className={`console__status ${connected === true ? "console__status--live" : connected === false ? "console__status--down" : ""}`}
                  role="status"
                >
                  {connected === true ? "Austin Dispatch Engine Connected" : connected === false ? "Dispatch Agent Unreachable" : "Checking dispatch agent…"}
                </div>
                <p>
                  {connected === false
                    ? "Start the local agent service to use chat and load live work orders."
                    : "Look up a customer, check availability, or ask about a work order."}
                </p>
                <div className="console__suggestions" aria-label="Suggested requests">
                  {quickPrompts.map((chip) => (
                    <button key={chip.label} type="button" onClick={() => onSendMessage(chip.text)} disabled={isLoading} title={chip.text}>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="console__messages">
                {state.history.map((msg) => {
                  const isUser = msg.role === "user";
                  return (
                    <div key={msg.id} className={`message ${isUser ? "message--out" : ""}`}>
                      <div className="message__who">{isUser ? "Dispatcher" : "DispatchAgent"}</div>
                      <div className="message__body">{msg.content}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {state.pendingAction && (
              <div className="gate">
                <div className="gate__title">
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>Confirmation Required</span>
                </div>

                <div className="gate__what">
                  <div className="gate__what-label">Proposed Mutation</div>
                  <div>{state.pendingAction.description}</div>
                  {state.pendingAction.type && (
                    <div className="gate__what-label">Action: {state.pendingAction.type.replace(/_/g, " ")}</div>
                  )}
                </div>

                <div className="gate__actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={onConfirm} disabled={isLoading}>
                    <Check size={12} aria-hidden="true" />
                    Confirm
                  </button>
                  <button type="button" className="btn btn--sm" onClick={onReject} disabled={isLoading}>
                    <X size={12} aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="console__status console__status--spaced">
                Agent executing operational workflow…
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="console__composer">
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
            <button type="submit" className="console__send" disabled={isLoading || !inputText.trim()} aria-label="Send message" title="Send message">
              <Send size={15} aria-hidden="true" />
            </button>
          </form>
        </>
      ) : activeTab === "events" ? (
        <EventTimeline events={state.events} isEmbedded />
      ) : (
        <div className="console__body">
          <div className="console__notice">
            Booking notices are drafted locally. Email is sent only when a real address and provider are configured; check each notice's status.
          </div>
          {notifications.length === 0 ? (
            <div className="console__notice">No notices queued yet.</div>
          ) : (
            notifications.map((notice) => (
              <div key={notice.id} className="console__notice-item">
                <div className="console__notice-meta">
                  <span>{notice.eventType}</span>
                  <span>{notice.audience}</span>
                  <span>{notice.channel || "INTERNAL"}</span>
                  <span>{notice.status}</span>
                </div>
                {notice.recipientAddress && <div className="console__notice-meta">To: {notice.recipientAddress}</div>}
                {notice.subject && <div className="console__notice-subject">{notice.subject}</div>}
                <div className="console__notice-body">{notice.message}</div>
                <div className="console__notice-meta">{notice.createdAt}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
