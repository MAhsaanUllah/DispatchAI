// One place for the words the owner reads about features: what each does, which booking step it
// automates, and which ones suit each business type. Plugin ids match the server's plugin ids.

export type RunsOn = "desktop" | "cloud";

// The nine things that happen on one booking. Five need a feature switched on; four always run.
export const BOOKING_STEPS: { label: string; by: string | null }[] = [
  { label: "Answer the call", by: "twilio" },
  { label: "Understand what they want", by: "ai" },
  { label: "Find a free time", by: null },
  { label: "Confirm with the caller", by: null },
  { label: "Save the booking", by: null },
  { label: "Email the confirmation", by: "email" },
  { label: "Remind before the visit", by: "reminders" },
  { label: "Hand problems to your team", by: null },
  { label: "Send it to your own tools", by: "n8n" }
];

export const automatedCount = (live: readonly string[]) => BOOKING_STEPS.filter((step) => !step.by || live.includes(step.by)).length;

export type FeatureInfo = {
  id: string;
  group: string;
  name: string;
  kind: "built-in" | "custom";
  benefit: string;
  changes: string;
};

// What the owner wants, not what the tech is called.
export const GROUPS: { title: string; purpose: string }[] = [
  { title: "Answer calls", purpose: "Let callers reach the agent on your phone number." },
  { title: "Understand callers", purpose: "Cope with people who do not say things the simple way." },
  { title: "Tell customers", purpose: "Keep customers informed without you writing a message." },
  { title: "Reach me from the internet", purpose: "Give a desktop or home computer a public address." },
  { title: "Tell my team and my tools", purpose: "Send what happens here to the apps you already use." }
];

export const FEATURES: FeatureInfo[] = [
  { id: "twilio", group: "Answer calls", name: "Phone line", kind: "built-in",
    benefit: "Callers ring your number and the agent books them, day and night.",
    changes: "Calls to your Twilio number are answered. Anyone who needs a person is passed to your staff, or becomes a call-back in the Inbox." },
  { id: "ai", group: "Understand callers", name: "AI brain", kind: "built-in",
    benefit: "Understands callers who describe the problem in their own words.",
    changes: "The agent reads what the caller means. Booking rules and the yes-confirmation still run in code. If the AI is down, the simple rules keep answering." },
  { id: "email", group: "Tell customers", name: "Email confirmations", kind: "built-in",
    benefit: "Customers get an email when a booking is made, moved or cancelled.",
    changes: "Every booking change sends one email to the customer. Without an email address on file, nothing is sent." },
  { id: "reminders", group: "Tell customers", name: "Reminders", kind: "built-in",
    benefit: "Fewer no-shows: customers are reminded before their visit.",
    changes: "Each booked customer gets one reminder email before the appointment, even if the server was off when it fell due. Needs Email." },
  { id: "tunnel", group: "Reach me from the internet", name: "Public address", kind: "built-in",
    benefit: "Lets phone calls and AI assistants reach this computer from the internet.",
    changes: "Runs Cloudflare's cloudflared program on this computer (it must be installed). While the app is open, a public https address leads to your login page; everything behind it still needs your PIN. A temporary address changes every time the app starts." },
  { id: "n8n", group: "Tell my team and my tools", name: "Custom workflow", kind: "custom",
    benefit: "Send every booking to Sheets, WhatsApp, a CRM or anything n8n can reach.",
    changes: "Each booking event is sent to your n8n link, signed, with IDs only: no names or addresses. Failed sends are retried and shown here." }
];

export const featureById = (id: string) => FEATURES.find((feature) => feature.id === id);

// Pre-ticked in onboarding. The owner can change every one of them.
export const RECOMMENDED: Record<string, string[]> = {
  "field-service": ["twilio", "ai", "email", "reminders"],
  "home-cleaning": ["twilio", "ai", "email", "reminders"],
  salon: ["twilio", "email", "reminders"],
  "auto-repair": ["twilio", "email", "reminders"]
};
export const recommendedFor = (templateId: string) => RECOMMENDED[templateId] ?? ["twilio", "email"];

// The phone line needs a public web address. A desktop install is not reachable from the internet yet, so say so.
export const phoneNote = (runsOn: RunsOn) => runsOn === "cloud"
  ? "Works on your cloud server: it already has a public https address."
  : "On a desktop install the phone line needs a public address: switch on Public address below, or run DispatchAI on a cloud server.";

export const RUNS_ON: { id: RunsOn; title: string; summary: string; points: string[] }[] = [
  { id: "desktop", title: "This computer", summary: "Private and free. Runs only while the app is open.",
    points: ["Your data stays on this PC.", "Test call and the dashboard work fully.", "Phone calls need the Public address feature (a tunnel)."] },
  { id: "cloud", title: "A cloud server", summary: "Always on, with a public https address.",
    points: ["Answers calls day and night.", "Phone calls and n8n work.", "You rent a small server (a VPS) and run the Docker install."] }
];

// Keys-based connections. They have no switch: they are live while at least one key exists.
export type ConnectionInfo = { id: "api" | "mcp"; group: string; name: string; kind: string; benefit: string; changes: string };

export const CONNECTIONS: ConnectionInfo[] = [
  { id: "api", group: "Tell my team and my tools", name: "Developer API", kind: "Keys",
    benefit: "Let your own software or a developer read bookings and create them.",
    changes: "Anyone holding a key can call this business's API. A look-up key cannot change anything. Revoke a key and it stops working at once." },
  { id: "mcp", group: "Tell my team and my tools", name: "AI assistant (MCP)", kind: "Keys",
    benefit: "Ask your own AI assistant about your bookings, or have it book for you.",
    changes: "Your assistant can see names and addresses, so connect only assistants you trust. A change it proposes is applied only after you clearly say yes." }
];
