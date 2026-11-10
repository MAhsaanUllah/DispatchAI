import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signEvent, verifyEventSignature, type WorkOrder } from "@dispatchai/shared";
import { buildBookingEvent } from "./outbound-events.js";
import { handleRequest } from "./worker.js";

const SECRET = "events_test_secret";
const now = () => String(Math.floor(Date.now() / 1000));

const workOrder: WorkOrder = {
  id: "wo_1026", customerId: "cust_101", propertyId: "prop_201", technicianId: "tech_01", serviceType: "HVAC",
  issueSummary: "Alicia says AC at 1402 South Congress Ave is warm", urgency: "STANDARD",
  scheduledStart: "2026-11-11T08:00:00Z", scheduledEnd: "2026-11-11T10:00:00Z", status: "BOOKED",
  createdBy: "VOICE_AGENT", createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z"
};

describe("event signatures", () => {
  it("accepts a fresh, untampered event and rejects tampering, replay and a wrong secret", async () => {
    const body = JSON.stringify(buildBookingEvent("booking.created", workOrder, "America/Chicago"));
    const ts = now();
    const sig = await signEvent(body, ts, SECRET);
    expect(await verifyEventSignature(body, ts, sig, SECRET)).toBe(true);
    expect(await verifyEventSignature(body.replace("wo_1026", "wo_9999"), ts, sig, SECRET)).toBe(false);
    expect(await verifyEventSignature(body, ts, sig, SECRET, Date.now() + 6 * 60 * 1000)).toBe(false);
    expect(await verifyEventSignature(body, ts, sig, "other_secret")).toBe(false);
  });

  it("carries IDs only, no name, address or free-text issue", () => {
    const json = JSON.stringify(buildBookingEvent("booking.created", workOrder, "America/Chicago"));
    expect(json).toContain("wo_1026");
    expect(json).toContain("cust_101");
    expect(json).not.toMatch(/Alicia|Congress|warm|prop_201/);
  });
});

describe("events sent after a booking", () => {
  const received: { body: string; headers: Record<string, string | string[] | undefined> }[] = [];
  let server: Server;
  let url = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ body, headers: req.headers });
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/hook`;
  });
  afterAll(() => {
    server.close();
    delete process.env.N8N_EVENTS_URL;
    delete process.env.N8N_EVENTS_SECRET;
  });

  const chat = async (session: string, message: string) => {
    const res = await handleRequest(new Request("http://localhost/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json", "x-session-id": session }, body: JSON.stringify({ message })
    }));
    return (await res.json()) as { reply: string; state: { availableSlots: { slotId: string }[] } };
  };
  const book = async (session: string) => {
    await chat(session, "5125550101");
    const offer = await chat(session, "My AC is blowing warm air, can you send someone tomorrow?");
    await chat(session, `Please book ${offer.state.availableSlots[0].slotId}`);
    return chat(session, "yes");
  };

  it("posts a signed booking.created event to N8N_EVENTS_URL", async () => {
    process.env.N8N_EVENTS_URL = url;
    process.env.N8N_EVENTS_SECRET = SECRET;
    const confirmed = await book("events_session_1");
    expect(confirmed.reply).toMatch(/confirmed/i);

    for (let i = 0; i < 40 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    const { body, headers } = received[0];
    expect(headers["x-dispatchai-event"]).toBe("booking.created");
    expect(await verifyEventSignature(body, String(headers["x-dispatchai-timestamp"]), String(headers["x-dispatchai-signature"]), SECRET)).toBe(true);
    expect(JSON.parse(body).data.bookingId).toMatch(/^wo_\d+$/);
  });

  it("still books when the event receiver is down", async () => {
    process.env.N8N_EVENTS_URL = "http://127.0.0.1:1/unreachable";
    process.env.N8N_EVENTS_SECRET = SECRET;
    const confirmed = await book("events_session_2");
    expect(confirmed.reply).toMatch(/confirmed/i);
  });
});

describe("n8n starter workflow", () => {
  const workflow = JSON.parse(readFileSync(new URL("../../../n8n/workflows/dispatchai-events-starter.json", import.meta.url), "utf8")) as {
    nodes: { name: string; type: string; parameters: { jsCode?: string } }[];
    connections: Record<string, { main: { node: string }[][] }>;
  };

  it("connects every node to an existing node", () => {
    const names = new Set(workflow.nodes.map((node) => node.name));
    for (const [from, value] of Object.entries(workflow.connections)) {
      expect(names.has(from)).toBe(true);
      for (const target of value.main.flat()) expect(names.has(target.node)).toBe(true);
    }
  });

  // Runs the n8n Code node with stubs to prove it accepts what signEvent produces and rejects a forgery.
  it("verify node accepts DispatchAI signatures and rejects forged ones", async () => {
    const code = workflow.nodes.find((node) => node.name === "Verify Signature")!.parameters.jsCode!;
    const run = (headers: Record<string, string>, body: unknown) =>
      new Function("require", "$input", "$env", "Buffer", code)(
        createRequire(import.meta.url), { first: () => ({ json: { headers, body } }) }, { DISPATCHAI_EVENTS_SECRET: SECRET }, Buffer
      ) as { json: { route: string } }[];
    const event = buildBookingEvent("booking.cancelled", workOrder, "America/Chicago");
    const body = JSON.stringify(event);
    const ts = now();
    const sig = await signEvent(body, ts, SECRET);
    expect(run({ "x-dispatchai-timestamp": ts, "x-dispatchai-signature": sig }, event)[0].json.route).toBe("booking.cancelled");
    const forged = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(run({ "x-dispatchai-timestamp": ts, "x-dispatchai-signature": forged }, event)[0].json.route).toBe("invalid");
  });
});
