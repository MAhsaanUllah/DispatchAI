import React from "react";
import { PhoneCall, Bot, Database, Plug, ShieldCheck, Cpu, Cable } from "lucide-react";

type SystemPlugin = {
  id: string; name: string; enabled: boolean;
  status?: { text: string; warning: boolean };
};

const STEPS = [
  {
    icon: PhoneCall,
    title: "Caller",
    meta: "Browser mic, or your Twilio number",
    copy: "A caller reaches the agent from the browser Test call. Connect the Twilio plugin and the same agent answers your own number."
  },
  {
    icon: Bot,
    title: "DispatchAI server",
    meta: "One server, running on this machine",
    copy: "The rule-based agent collects the job, the customer and the slot. An optional AI brain handles the awkward parts of the call."
  },
  {
    icon: ShieldCheck,
    title: "Confirmation gate",
    meta: "Nothing is written without a yes",
    copy: "Every booking, reschedule and cancellation is proposed first and written only after you confirm it. The agent never books on its own."
  },
  {
    icon: Database,
    title: "SQLite on this machine",
    meta: "One database file, no cloud",
    copy: "Work orders, technicians, slots and customers live in a single file beside the server. Back it up by copying that file."
  },
  {
    icon: Cable,
    title: "Plugins",
    meta: "What a confirmed booking touches",
    copy: "Each plugin is optional and switched on from the Plugins page. A plugin that is off is simply skipped."
  }
] as const;

// Live plugin state, as chips that open the Plugins page.
function PluginChips({ onOpenPlugins }: { onOpenPlugins: () => void }) {
  const [plugins, setPlugins] = React.useState<SystemPlugin[] | null>(null);
  React.useEffect(() => {
    fetch("/api/plugins").then((r) => (r.ok ? r.json() : null)).then((body) => setPlugins(body?.data?.plugins ?? null)).catch(() => setPlugins(null));
  }, []);
  if (!plugins) return <p className="flow__note">Reading plugin status…</p>;
  return (
    <div className="chip-row">
      {plugins.map((plugin) => (
        <button key={plugin.id} type="button" className={`chip ${plugin.enabled ? "chip--on" : "chip--off"}`} onClick={onOpenPlugins} title={plugin.status?.text ?? (plugin.enabled ? "Connected" : "Not connected")}>
          <span className={`swatch swatch--${plugin.enabled ? "live" : "closed"}`} aria-hidden="true" />
          <span className="chip__name">{plugin.name}</span>
          <span className="chip__state">{plugin.enabled ? "live" : "off"}</span>
        </button>
      ))}
      <button type="button" className="chip chip--link" onClick={onOpenPlugins}>Manage plugins</button>
    </div>
  );
}

export function SystemPanel({ onOpenPlugins }: { onOpenPlugins: () => void }) {
  return (
    <section className="page" aria-label="System architecture">
      <div className="page__head">
        <div className="page__head-text">
          <h1 className="page__title">How the dispatch loop is wired</h1>
          <p className="page__lede">One server on this machine takes the call, confirms the booking and writes it to the database. Plugins carry it out from there.</p>
        </div>
      </div>

      <ol className="flow">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li className="flow__step" key={step.title}>
              <span className="flow__icon" aria-hidden="true"><Icon size={15} /></span>
              <div className="flow__body">
                <div className="flow__head">
                  <h2 className="flow__title">{step.title}</h2>
                  <span className="flow__meta">{step.meta}</span>
                </div>
                <p className="flow__copy">{step.copy}</p>
                {step.title === "Plugins" && <PluginChips onOpenPlugins={onOpenPlugins} />}
              </div>
              {index === 1 && <span className="flow__note"><Cpu size={12} aria-hidden="true" />The AI brain is a plugin, not the agent. Without it the rule-based agent still books.</span>}
            </li>
          );
        })}
      </ol>

      <div className="facts">
        <div className="fact">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>Nothing reaches a customer without a confirmation step in between.</span>
        </div>
        <div className="fact">
          <Plug size={15} aria-hidden="true" />
          <span>Plugins are the only part that leaves this machine, and only the ones you connect.</span>
        </div>
        <div className="fact">
          <Database size={15} aria-hidden="true" />
          <span>One SQLite file holds the whole business: jobs, technicians, slots, customers.</span>
        </div>
      </div>
    </section>
  );
}
