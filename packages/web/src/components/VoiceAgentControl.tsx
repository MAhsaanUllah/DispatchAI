import React, { useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Mic, PhoneOff, Radio, X } from "lucide-react";
import { api } from "../api";

interface VoiceAgentControlProps {
  isOpen: boolean;
  onClose: () => void;
  onEventEmitted?: () => void;
  sessionId: string;
}

function VoiceCall({ onClose, sessionId, onEventEmitted }: VoiceAgentControlProps) {
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "agent"; text: string }>>([]);
  const voiceToolToken = useRef("");
  const conversationIdRef = useRef("");
  const invoke = async (name: string, parameters: Record<string, unknown>) => {
    if (!voiceToolToken.current) return JSON.stringify({ ok: false, error: "Voice session expired. Start a new call." });
    try {
      const result = await api.executeVoiceTool(name, parameters, voiceToolToken.current, conversationIdRef.current);
      onEventEmitted?.();
      return JSON.stringify(result.envelope);
    } catch (failure) {
      onEventEmitted?.();
      return JSON.stringify({ ok: false, error: failure instanceof Error ? failure.message : "Tool failed" });
    }
  };
  const conversation = useConversation({
    onConnect: ({ conversationId: id }) => { conversationIdRef.current = id; setConversationId(id); },
    onDisconnect: () => { conversationIdRef.current = ""; voiceToolToken.current = ""; setConversationId(""); },
    onError: (message) => setError(message),
    onMessage: ({ role, message }) => setMessages((previous) => [...previous, { role, text: message }]),
    clientTools: {
      find_customer: (params) => invoke("find_customer", params),
      check_availability: (params) => invoke("check_availability", params),
      get_work_order: (params) => invoke("get_work_order", params),
      create_work_order: (params) => invoke("create_work_order", params),
      reschedule_work_order: (params) => invoke("reschedule_work_order", params),
      cancel_work_order: (params) => invoke("cancel_work_order", params)
    }
  });

  const start = async () => {
    setError("");
    try {
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      permission.getTracks().forEach((track) => track.stop());
      const response = await api.createVoiceSession(sessionId);
      if (!response?.data?.signedUrl) throw new Error("ElevenLabs did not return a signed URL");
      voiceToolToken.current = response.data.voiceToolToken;
      conversation.startSession({ signedUrl: response.data.signedUrl, connectionType: "websocket" });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Voice connection failed");
    }
  };

  const close = () => {
    conversation.endSession();
    voiceToolToken.current = "";
    onClose();
  };

  const active = conversation.status === "connected";
  const connecting = conversation.status === "connecting";
  const orbState = connecting ? "connecting" : active ? (conversation.isSpeaking ? "talking" : "listening") : "idle";
  const orbLabel = connecting ? "Connecting your call…" : active ? (conversation.isSpeaking ? "DispatchAI is speaking" : "Listening to you") : "Start a conversation";

  return (
    <div className="voice-backdrop" role="dialog" aria-modal="true" aria-label="DispatchAI voice assistant">
      <div className="voice-panel">
        <div className="voice-header">
          <div className="voice-brand">
            <span className="voice-brand-mark"><Radio size={15} /></span>
            <span>DispatchAI <span className="voice-brand-divider">/</span> Voice assistant</span>
          </div>
          <button className="voice-close" onClick={close} aria-label="Close voice call"><X size={18} /></button>
        </div>
        <div className="voice-hero">
          <div className="voice-avatar"><img src="/dispatch-agent-avatar.png" alt="DispatchAI dispatcher avatar" /></div>
          <div className="voice-hero-copy">
            <div className="voice-hero-title">Your dispatch assistant</div>
            <p>HVAC &amp; plumbing · Austin operations</p>
            <span className={`voice-status ${active ? "is-live" : ""}`}>
              <span className="voice-status-dot" />
              {active ? (conversation.isSpeaking ? "Agent speaking" : "Listening to you") : connecting ? "Connecting…" : "Ready for a call"}
            </span>
          </div>
        </div>
        <div className="voice-transcript-head">
          <span>Conversation</span>
          <span>{active ? "LIVE TRANSCRIPT" : "NO ACTIVE CALL"}</span>
        </div>
        <div className="voice-transcript" aria-live="polite">
          <div className={`voice-orb-stage ${messages.length ? "has-messages" : ""}`}>
            <div className={`voice-orb voice-orb-${orbState}`} aria-hidden="true" />
            <strong>{orbLabel}</strong>
            {messages.length === 0 && <span>Ask about an HVAC or plumbing issue. Live messages and tool actions appear here.</span>}
          </div>
          {messages.map((item, index) => (
            <div key={index} className={`voice-message ${item.role === "user" ? "from-user" : "from-agent"}`}>
              <span>{item.role === "user" ? "You" : "DispatchAI"}</span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        {error && <p className="voice-error" role="alert">{error}</p>}
        <div className="voice-footer">
          <div className="voice-footer-meta">
            <span>Powered by ElevenLabs · connected to dispatch tools</span>
            {conversationId && <span className="voice-conversation-id">{conversationId}</span>}
          </div>
          {active ? <button className="voice-button voice-end" onClick={() => conversation.endSession()}><PhoneOff size={16} /> End call</button> : <button className="voice-button voice-start" onClick={start} disabled={connecting}><Mic size={16} /> {connecting ? "Connecting" : "Start voice call"}</button>}
        </div>
        <p className="voice-footnote">Calls use ElevenLabs minutes. Booking changes require your explicit confirmation.</p>
      </div>
    </div>
  );
}

export const VoiceAgentControl: React.FC<VoiceAgentControlProps> = ({ isOpen, onClose, sessionId, onEventEmitted }) => {
  if (!isOpen) return null;
  return <ConversationProvider><VoiceCall isOpen={isOpen} onClose={onClose} sessionId={sessionId} onEventEmitted={onEventEmitted} /></ConversationProvider>;
};
