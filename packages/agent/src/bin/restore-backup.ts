#!/usr/bin/env node
// Usage (server stopped): restore-backup <backup.json> <database path> [--force]
import { readFileSync } from "node:fs";
import { restoreBackup } from "../backup.js";

const [file, database, flag] = process.argv.slice(2);
if (!file || !database) {
  console.error("Usage: restore-backup <backup.json> <database path> [--force]");
  process.exit(2);
}
try {
  const { movedAside } = restoreBackup(JSON.parse(readFileSync(file, "utf8")), database, flag === "--force");
  console.log(`Restored to ${database}.${movedAside.length ? ` Old files moved aside:\n  ${movedAside.join("\n  ")}` : ""}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
