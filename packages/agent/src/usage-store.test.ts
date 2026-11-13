import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { estimateCostUsd, UsageLog } from "./usage-store.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-usage-"));
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows keeps SQLite files locked */ } });

const row = (at: string, input: number | null, output: number | null, ok = true) => ({ at, provider: "groq", model: "llama", inputTokens: input, outputTokens: output, ok });

describe("AI usage log", () => {
  it("adds up what the provider reported since a moment, and counts failures and unreported requests", () => {
    const log = new UsageLog(join(dir, "usage.sqlite"));
    log.add(row("2026-11-01T10:00:00.000Z", 100, 20));
    log.add(row("2026-11-13T09:00:00.000Z", 300, 40));
    log.add(row("2026-11-13T10:00:00.000Z", null, null)); // answered, no token count in the reply
    log.add(row("2026-11-13T11:00:00.000Z", null, null, false)); // failed
    expect(log.summary("2026-11-13T00:00:00.000Z")).toEqual({ requests: 3, failures: 1, inputTokens: 300, outputTokens: 40, unreported: 1 });
    expect(log.summary("2026-11-01T00:00:00.000Z").inputTokens).toBe(400);
    // It survives a restart.
    expect(new UsageLog(join(dir, "usage.sqlite")).summary("2026-11-01T00:00:00.000Z").requests).toBe(4);
  });

  it("works without a database file too", () => {
    const log = new UsageLog();
    log.add(row("2026-11-13T09:00:00.000Z", 10, 5));
    expect(log.summary("2026-11-13T00:00:00.000Z").requests).toBe(1);
  });
});

describe("estimated cost", () => {
  it("multiplies tokens by the owner's own price per million, and never guesses a price", () => {
    expect(estimateCostUsd({ inputTokens: 2_000_000, outputTokens: 500_000 }, { input: 0.15, output: 0.6 })).toBeCloseTo(0.6, 6);
    expect(estimateCostUsd({ inputTokens: 1000, outputTokens: 1000 }, null)).toBeNull();
  });
});
