import React from "react";
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
  { id: "caller", icon: PhoneCall, title: "Caller", subtitle: "Browser mic or phone audio", meta: "WebRTC capture", tone: "caller" },
  { id: "agent", icon: Bot, title: "ElevenLabs Agent", subtitle: "Conversational voice dispatcher", meta: "STT, LLM, TTS", tone: "voice" },
  { id: "worker", icon: Cloud, title: "Cloudflare Worker", subtitle: "Agents SDK runtime", meta: "Tool calls, durable state", tone: "edge" },
  { id: "n8n", icon: Workflow, title: "n8n Workflow", subtitle: "DispatchAI, all operations on one canvas", meta: "Webhook actions", tone: "workflow" },
  { id: "domain", icon: Database, title: "Domain API", subtitle: "Work orders, schedules, SQLite", meta: "Source of truth", tone: "data" },
];

const EDGES: Array<[string, string, string]> = [
  ["caller", "agent", "audio in, voice out"],
  ["agent", "worker", "tool invocation"],
  ["worker", "n8n", "signed webhook"],
  ["n8n", "domain", "HTTP actions"],
];

function Node({ node }: { node: SystemNode }) {
  const Icon = node.icon;
  return (
    <div className="route__stop" data-node={node.id}>
      <span className="route__stop-name">{node.title}</span>
      <span className="route__stop-role">{node.subtitle}</span>
      <span className="route__stop-meta">{node.meta}</span>
    </div>
  );
}

// Read-only connection health. Connecting and disconnecting happens on the Plugins page only.
function ConnectionHealth() {
  const [plugins, setPlugins] = React.useState<{ id: string; name: string; enabled: boolean }[] | null>(null);
  React.useEffect(() => {
    fetch("/api/plugins").then((r) => (r.ok ? r.json() : null)).then((body) => setPlugins(body?.data?.plugins ?? null)).catch(() => setPlugins(null));
  }, []);
  if (!plugins) return null;
  return (
    <ul className="connections" aria-label="Connections">
      {plugins.map((plugin) => (
        <li key={plugin.id} className={plugin.enabled ? "is-on" : undefined}>
          <span className={`swatch ${plugin.enabled ? "swatch--live" : "swatch--closed"}`} aria-hidden="true" />
          {plugin.name}: {plugin.enabled ? "connected" : "not connected"}
        </li>
      ))}
    </ul>
  );
}

export function SystemPanel() {
  return (
    <section className="page" aria-label="System architecture">
      <div className="page__head">
        <h1 className="page__title">How the dispatch loop is wired</h1>
      </div>
      <ConnectionHealth />
      <p className="page__lede">
        Voice bookings ride this exact path: the ElevenLabs agent reasons and speaks, the Cloudflare Worker holds
        tool logic and state, n8n executes the operational actions, and the domain API owns the work-order data.
      </p>

      <div className="route">
        {NODES.map((node) => <Node key={node.id} node={node} />)}
      </div>

      <div className="route__legs">
        {EDGES.map(([from, to, label]) => (
          <div className="route__leg" key={`${from}-${to}`} data-from={from} data-to={to}>
            <span>{label}</span>
            <span className="route__leg-line" />
          </div>
        ))}
      </div>

      <div className="facts">
        <div className="fact">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>Every booking, reschedule or cancellation still requires explicit confirmation before the Worker calls n8n.</span>
        </div>
        <div className="fact">
          <Workflow size={15} aria-hidden="true" />
          <span>One n8n canvas routes all operations: availability checks, bookings, reschedules, cancellations and directory reads.</span>
        </div>
        <div className="fact">
          <Cloud size={15} aria-hidden="true" />
          <span>The Worker keeps conversation state, session identity and pending-action gates between voice turns.</span>
        </div>
      </div>

      <div className="page__note">
        This page mirrors the running local stack: web dashboard, agent Worker on port 8787, n8n on port 5678, domain API on port 3100, then SQLite.
      </div>
    </section>
  );
}
