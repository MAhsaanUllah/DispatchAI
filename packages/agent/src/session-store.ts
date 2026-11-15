import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentState } from "./state.js";

type VoiceToken = { sessionId: string; expiresAt: number };

// Conversation state and voice tokens that must survive a restart. Same SQLite file as the business data;
// without a path everything stays in memory (tests, quick local runs).
// shortcut: state JSON grows with history/events; add a size cap and retention with PR 12.
export class SessionStore {
  private db?: DatabaseSync;
  private states = new Map<string, string>();
  private tokens = new Map<string, VoiceToken>();

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_tokens (token TEXT PRIMARY KEY, session_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    `);
  }

  loadState(sessionId: string): AgentState | undefined {
    const raw = this.db
      ? (this.db.prepare("SELECT state FROM agent_sessions WHERE id = ?").get(sessionId) as { state: string } | undefined)?.state
      : this.states.get(sessionId);
    return raw ? (JSON.parse(raw) as AgentState) : undefined;
  }

  saveState(sessionId: string, state: AgentState): void {
    const json = JSON.stringify(state);
    if (!this.db) {
      this.states.set(sessionId, json);
      return;
    }
    this.db
      .prepare("INSERT INTO agent_sessions (id, state, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at")
      .run(sessionId, json, Date.now());
  }

  saveToken(token: string, value: VoiceToken): void {
    if (!this.db) {
      this.tokens.set(token, value);
      return;
    }
    this.db.prepare("INSERT OR REPLACE INTO voice_tokens (token, session_id, expires_at) VALUES (?, ?, ?)").run(token, value.sessionId, value.expiresAt);
  }

  // Returns a live token; expired tokens are deleted and treated as missing.
  getToken(token: string): VoiceToken | undefined {
    if (!token) return undefined;
    const value = this.db
      ? (() => {
          const row = this.db!.prepare("SELECT session_id, expires_at FROM voice_tokens WHERE token = ?").get(token) as { session_id: string; expires_at: number } | undefined;
          return row ? { sessionId: row.session_id, expiresAt: row.expires_at } : undefined;
        })()
      : this.tokens.get(token);
    if (value && value.expiresAt <= Date.now()) {
      if (this.db) this.db.prepare("DELETE FROM voice_tokens WHERE token = ?").run(token);
      else this.tokens.delete(token);
      return undefined;
    }
    return value;
  }

  close(): void {
    this.db?.close();
  }
}
