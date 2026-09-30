import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DispatchStore, type Snapshot } from "./store.js";

export class SQLiteDispatchStore extends DispatchStore {
  private database: DatabaseSync;

  constructor(databasePath: string) {
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    const database = new DatabaseSync(path);
    database.exec("CREATE TABLE IF NOT EXISTS dispatch_state (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot TEXT NOT NULL)");
    const row = database.prepare("SELECT snapshot FROM dispatch_state WHERE id = 1").get() as { snapshot: string } | undefined;
    super(row ? JSON.parse(row.snapshot) as Snapshot : undefined, (snapshot) => {
      database.prepare("INSERT INTO dispatch_state (id, snapshot) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot").run(JSON.stringify(snapshot));
    });
    this.database = database;
  }

  public close(): void {
    this.database.close();
  }
}
