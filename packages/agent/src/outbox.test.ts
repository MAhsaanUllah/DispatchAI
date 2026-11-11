import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backoffMs, MAX_ATTEMPTS, Outbox } from "./outbox.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-outbox-"));
let server: Server;
let url = "";
let answer = 200;
const received: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push(JSON.parse(body).eventId);
      res.statusCode = answer;
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/hook`;
});
afterAll(() => {
  server.close();
  // Windows keeps open SQLite files locked; a leftover temp folder is harmless.
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

const event = (id: string) => ({ eventId: id, type: "booking.created", occurredAt: "", data: { bookingId: "wo_1026" } });
const target = async () => ({ url, secret: "outbox-test-secret-123" });

describe("Outbox", () => {
  it("retries with backoff, then delivers once with the same event id", async () => {
    const box = new Outbox(undefined, target);
    const t0 = 1_000_000;
    answer = 500;
    box.enqueue(event("evt_a"), t0);
    await box.drain(t0);
    expect(box.recent()[0]).toMatchObject({ status: "pending", attempts: 1, lastError: "HTTP 500", nextAttemptAt: t0 + backoffMs(1) });

    const sentBefore = received.length;
    await box.drain(t0 + 1000); // not due yet
    expect(received.length).toBe(sentBefore);

    answer = 200;
    await box.drain(t0 + backoffMs(1));
    expect(box.recent()[0]).toMatchObject({ status: "delivered", attempts: 2 });
    expect(received.filter((id) => id === "evt_a")).toHaveLength(2);
    await box.drain(t0 + 10 * backoffMs(5));
    expect(received.filter((id) => id === "evt_a")).toHaveLength(2);
  });

  it("parks an event as dead after the last attempt; Retry sends it again", async () => {
    const box = new Outbox(undefined, target);
    answer = 503;
    let now = 2_000_000;
    box.enqueue(event("evt_b"), now);
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      await box.drain(now);
      now += backoffMs(i);
    }
    expect(box.recent()[0]).toMatchObject({ status: "dead", attempts: MAX_ATTEMPTS });
    answer = 200;
    expect(box.retry("evt_b", now)).toBe(true);
    await box.drain(now);
    expect(box.recent()[0].status).toBe("delivered");
    expect(box.retry("evt_b")).toBe(false);
  });

  it("keeps pending events across a restart and records why n8n was not called", async () => {
    const path = join(dir, "outbox.sqlite");
    const first = new Outbox(path, async () => undefined);
    first.enqueue(event("evt_c"), 3_000_000);
    await first.drain(3_000_000);
    expect(first.recent()[0]).toMatchObject({ status: "pending", lastError: "n8n plugin not connected" });

    answer = 200;
    const restarted = new Outbox(path, target);
    await restarted.drain(3_000_000 + backoffMs(1));
    expect(restarted.recent()[0]).toMatchObject({ id: "evt_c", status: "delivered" });
    expect(restarted.recent()[0]).not.toHaveProperty("body");
  });
});
