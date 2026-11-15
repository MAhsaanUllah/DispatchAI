import React, { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Mic, PhoneOff, X } from "lucide-react";
import { api } from "../api";

interface VoiceAgentControlProps {
  isOpen: boolean;
  onClose: () => void;
  onEventEmitted?: () => void;
  sessionId: string;
  visitor?: { name: string; email?: string; persona?: string };
  autoStart?: boolean;
}

function VoiceCall({ onClose, sessionId, onEventEmitted, visitor, autoStart }: VoiceAgentControlProps) {
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "agent"; text: string }>>([]);
  const voiceToolToken = useRef("");
  const conversationIdRef = useRef("");
  const bookedId = useRef("");
  const invoke = async (name: string, parameters: Record<string, unknown>) => {
    if (!voiceToolToken.current) return JSON.stringify({ ok: false, error: "Voice session expired. Start a new call." });
    try {
      const result = await api.executeVoiceTool(name, parameters, voiceToolToken.current, conversationIdRef.current, sessionId);
      const workOrderId = result?.envelope?.ok && name === "create_work_order" ? result.envelope.data?.workOrder?.id : "";
      if (workOrderId) {
        bookedId.current = workOrderId;
        sessionStorage.setItem("dispatch_demo_work_order", workOrderId);
      }
      onEventEmitted?.();
      return JSON.stringify(result.envelope);
    } catch (failure) {
      onEventEmitted?.();
      return JSON.stringify({ ok: false, error: failure instanceof Error ? failure.message : "Tool failed" });
    }
  };
  const conversation = useConversation({
    onConnect: ({ conversationId: id }) => { conversationIdRef.current = id; setConversationId(id); },
    onDisconnect: () => {
      conversationIdRef.current = "";
      setConversationId("");
      if (voiceToolToken.current) void api.endVoiceSession(voiceToolToken.current).catch(() => {});
      if (bookedId.current) window.location.assign("/app");
    },
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
      const response = await api.createVoiceSession(sessionId, visitor);
      if (!response?.data?.signedUrl) throw new Error("ElevenLabs did not return a signed URL");
      voiceToolToken.current = response.data.voiceToolToken;
      const dynamicVariables = response.data.address ? {
        visitor_name: response.data.name,
        demo_address: response.data.address,
        demo_phone: response.data.phone,
        demo_service_type: response.data.serviceType,
        demo_zone: response.data.zone,
        demo_today: response.data.today,
        demo_tomorrow: response.data.tomorrow
      } : undefined;
      conversation.startSession({
        signedUrl: response.data.signedUrl,
        connectionType: "websocket",
        dynamicVariables
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Voice connection failed");
    }
  };

  const didAutoStart = useRef(false);
  useEffect(() => {
    if (autoStart && !didAutoStart.current) {
      didAutoStart.current = true;
      void start();
    }
  }, [autoStart]);

  useEffect(() => {
    const release = () => {
      const token = voiceToolToken.current;
      voiceToolToken.current = "";
      if (token) void api.endVoiceSession(token).catch(() => {});
    };
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, []);

  const close = () => {
    conversation.endSession();
    if (voiceToolToken.current) void api.endVoiceSession(voiceToolToken.current);
    if (bookedId.current) { window.location.assign("/app"); return; }
    onClose();
  };

  const active = conversation.status === "connected";
  const connecting = conversation.status === "connecting";
  const orbLabel = connecting ? "Connecting your call…" : active ? (conversation.isSpeaking ? "DispatchAI is speaking" : "Listening to you") : "Start a conversation";

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="DispatchAI voice assistant">
      <div className="modal__panel">
        <div className="modal__head">
          <span className="public__card-label">DispatchAI voice assistant</span>
          <button className="modal__close" onClick={close} aria-label="Close voice call"><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="public__card-head">
          <span className="public__card-label">HVAC and plumbing, Austin operations</span>
          <span className={`public__readonly ${active ? "public__readonly--live" : ""}`}>
            {active ? (conversation.isSpeaking ? "Agent speaking" : "Listening to you") : connecting ? "Connecting…" : "Ready for a call"}
          </span>
        </div>
        <div className="modal__transcript" aria-live="polite">
          {messages.length === 0 ? (
            <p className="field__hint">Ask about an HVAC or plumbing issue. Live messages and tool actions appear here.</p>
          ) : (
            messages.map((item, index) => (
              <div key={index} className={`message ${item.role === "user" ? "message--out" : ""}`}>
                <div className="message__who">{item.role === "user" ? "You" : "DispatchAI"}</div>
                <div className="message__body">{item.text}</div>
              </div>
            ))
          )}
        </div>
        {error && <p className="field__error" role="alert">{error}</p>}
        <div className="modal__foot">
          <span className="field__hint">{orbLabel}</span>
          {active
            ? <button className="btn btn--danger" onClick={close}><PhoneOff size={15} aria-hidden="true" /> End call</button>
            : <button className="btn btn--primary" onClick={start} disabled={connecting}><Mic size={15} aria-hidden="true" /> {connecting ? "Connecting" : "Start voice call"}</button>}
        </div>
        <p className="field__hint">Calls use ElevenLabs minutes. Each Google account gets 2 demo calls. Booking changes require your explicit confirmation.</p>
      </div>
    </div>
  );
}

export const VoiceAgentControl: React.FC<VoiceAgentControlProps> = ({ isOpen, onClose, sessionId, onEventEmitted, visitor, autoStart }) => {
  if (!isOpen) return null;
  return <ConversationProvider><VoiceCall isOpen={isOpen} onClose={onClose} sessionId={sessionId} onEventEmitted={onEventEmitted} visitor={visitor} autoStart={autoStart} /></ConversationProvider>;
};
