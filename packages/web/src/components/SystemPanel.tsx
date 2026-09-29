import { Workflow, Cloud, Bot, Database, PhoneCall, ShieldCheck } from "lucide-react";

type NodeStatus = "live" | "flowing";

interface SystemNode {
  id: string;
  icon: React.ComponentType<{ size?: number | string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  subtitle: string;
  meta: string;
  tone: "caller" | "voice" | "edge" | "workflow" | "data";
}

const NODES: SystemNode[] = [
  { id: "caller", icon: PhoneCall, title: "Caller", subtitle: "Browser mic / phone audio", meta: "WebRTC capture", tone: "caller" },
  { id: "agent", icon: Bot, title: "ElevenLabs Agent", subtitle: "Conversational voice dispatcher", meta: "STT → LLM → TTS", tone: "voice" },
  { id: "worker", icon: Cloud, title: "Cloudflare Worker", subtitle: "Agents SDK runtime", meta: "Tool calls · Durable state", tone: "edge" },
  { id: "n8n", icon: Workflow, title: "n8n Workflow", subtitle: "DispatchAI — All Operations (Single Canvas)", meta: "Webhook actions", tone: "workflow" },
  { id: "domain", icon: Database, title: "Domain API", subtitle: "Work orders · Schedules · SQLite", meta: "Source of truth", tone: "data" },
];

const EDGES: Array<[string, string, string]> = [
  ["caller", "agent", "audio in / voice out"],
  ["agent", "worker", "tool invocation"],
  ["worker", "n8n", "signed webhook"],
  ["n8n", "domain", "HTTP actions"],
];

const TONES: Record<SystemNode["tone"], { border: string; bg: string; icon: string; label: string }> = {
  caller: { border: "#CDCDC7", bg: "#FFFFFF", icon: "var(--text-secondary)", label: "Input" },
  voice: { border: "#C7D6F8", bg: "#F5F8FF", icon: "var(--accent)", label: "Voice AI" },
  edge: { border: "#F5C97B", bg: "#FFFBEB", icon: "var(--warning)", label: "Edge runtime" },
  workflow: { border: "#BBE5C8", bg: "#F0FDF4", icon: "var(--success)", label: "Automation" },
  data: { border: "#E3D5C8", bg: "#FBF7F2", icon: "#9A6B3F", label: "Persistence" },
};

function Node({ node, pulse }: { node: SystemNode; pulse: boolean }) {
  const tone = TONES[node.tone];
  const Icon = node.icon;
  return (
    <div
      className={`sys-node${pulse ? " is-flowing" : ""}`}
      style={{ borderColor: tone.border, background: tone.bg }}
      data-node={node.id}
    >
      <span className="sys-node-icon" style={{ color: tone.icon }}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="sys-node-text">
        <strong>{node.title}</strong>
        <em>{node.subtitle}</em>
        <small>{node.meta}</small>
      </span>
      <span className="sys-node-ping" aria-hidden="true" />
    </div>
  );
}

export function SystemPanel() {
  return (
    <section className="directory-page system-page" aria-label="System architecture">
      <div className="directory-head">
        <div>
          <span className="directory-eyebrow">AUSTIN OPERATIONS / LIVE ARCHITECTURE</span>
          <h1>How the dispatch loop is wired</h1>
        </div>
        <span className="directory-pill"><span className="sys-pill-dot" aria-hidden="true" /> All hops live · Local demo</span>
      </div>
      <p className="directory-intro">
        Voice bookings ride this exact path: the ElevenLabs agent reasons and speaks, the Cloudflare Worker (Agents SDK) holds
        tool logic and state, n8n executes the operational actions, and the domain API owns the work-order data.
      </p>

      <div className="sys-canvas op-surface">
        <div className="sys-lane sys-lane-nodes">
          {NODES.map((node) => <Node key={node.id} node={node} pulse={node.id !== "caller"} />)}
        </div>
        <div className="sys-rails" aria-hidden="true">
          {EDGES.map(([from, to, label]) => (
            <div className="sys-rail" key={`${from}-${to}`} data-from={from} data-to={to}>
              <span className="sys-rail-label">{label}</span>
              <span className="sys-rail-line">
                <span className="sys-packet" />
                <span className="sys-packet sys-packet-delay" />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="sys-facts">
        <div className="sys-fact">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>Every booking, reschedule or cancellation still requires explicit confirmation before the Worker calls n8n.</span>
        </div>
        <div className="sys-fact">
          <Workflow size={15} aria-hidden="true" />
          <span>One n8n canvas routes all operations — availability checks, bookings, reschedules, cancellations and directory reads.</span>
        </div>
        <div className="sys-fact">
          <Cloud size={15} aria-hidden="true" />
          <span>The Worker keeps conversation state, session identity and pending-action gates between voice turns.</span>
        </div>
      </div>

      <div className="directory-note">
        This page mirrors the running local stack: web dashboard → agent Worker (:8787) → n8n (:5678) → domain API (:3100) → SQLite.
      </div>
    </section>
  );
}
