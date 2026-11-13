import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// One row per AI request. Token counts are what the provider reported; null means it did not report them.
export type UsageRow = { at: string; provider: string; model: string; inputTokens: number | null; outputTokens: number | null; ok: boolean };
export type UsageSummary = { requests: number; failures: number; inputTokens: number; outputTokens: number; unreported: number };

// Dollars are never guessed: the owner types their own price per million tokens, and this multiplies.
export function estimateCostUsd(summary: Pick<UsageSummary, "inputTokens" | "outputTokens">, price: { input: number; output: number } | null): number | null {
  if (!price) return null;
  return (summary.inputTokens * price.input + summary.outputTokens * price.output) / 1_000_000;
}

export class UsageLog {
  private db?: DatabaseSync;
  private mem: UsageRow[] = [];

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS llm_usage (at TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, ok INTEGER NOT NULL)");
    this.db.exec("CREATE INDEX IF NOT EXISTS llm_usage_at ON llm_usage (at)");
  }

  add(row: UsageRow): void {
    if (!this.db) { this.mem.push(row); return; }
    this.db.prepare("INSERT INTO llm_usage (at, provider, model, input_tokens, output_tokens, ok) VALUES (?, ?, ?, ?, ?, ?)")
      .run(row.at, row.provider, row.model, row.inputTokens, row.outputTokens, row.ok ? 1 : 0);
  }

  // Everything from `sinceIso` (an ISO instant) until now.
  summary(sinceIso: string): UsageSummary {
    const rows: UsageRow[] = this.db
      ? (this.db.prepare("SELECT at, provider, model, input_tokens, output_tokens, ok FROM llm_usage WHERE at >= ?").all(sinceIso) as Record<string, string | number | null>[])
          .map((r) => ({ at: String(r.at), provider: String(r.provider), model: String(r.model), inputTokens: r.input_tokens as number | null, outputTokens: r.output_tokens as number | null, ok: r.ok === 1 }))
      : this.mem.filter((row) => row.at >= sinceIso);
    const total: UsageSummary = { requests: rows.length, failures: 0, inputTokens: 0, outputTokens: 0, unreported: 0 };
    for (const row of rows) {
      if (!row.ok) total.failures += 1;
      if (row.inputTokens === null && row.outputTokens === null) { if (row.ok) total.unreported += 1; continue; }
      total.inputTokens += row.inputTokens ?? 0;
      total.outputTokens += row.outputTokens ?? 0;
    }
    return total;
  }
}
