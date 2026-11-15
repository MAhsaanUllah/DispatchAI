import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { CallLog } from "./call-log.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-calls-"));
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows keeps SQLite files locked */ } });

it("call history survives a restart and counts today's calls beyond 20", () => {
  const path = join(dir, "calls.sqlite");
  const first = new CallLog(path);
  for (let i = 0; i < 25; i++) first.save({ id: `call_${i}`, from: "***1234", startedAt: `2026-11-15T10:${String(i).padStart(2, "0")}:00.000Z`, turns: 2, silences: 0, outcome: "Booked" });
  first.save({ id: "call_0", from: "***1234", startedAt: "2026-11-15T10:00:00.000Z", turns: 3, silences: 0, outcome: "Call-back requested" });
  first.close();
  const restarted = new CallLog(path);
  expect(restarted.recent(50)).toHaveLength(25);
  expect(restarted.recent(1)[0].id).toBe("call_24");
  expect(restarted.recent(50).find((c) => c.id === "call_0")?.outcome).toBe("Call-back requested");
  expect(restarted.countSince("2026-11-15T10:10:00.000Z")).toBe(15);
  restarted.close();
});
