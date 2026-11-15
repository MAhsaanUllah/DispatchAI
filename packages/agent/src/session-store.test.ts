import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";
import { SessionStore } from "./session-store.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-sessions-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("SessionStore", () => {
  it("keeps a pending booking confirmation across a restart", async () => {
    const path = join(dir, "restart.sqlite");
    const client = new N8nClient({ baseUrl: "http://localhost:5678", secret: "test", directService: new DispatchService() });

    const before = new SessionStore(path);
    const agent = new DispatchAgent("caller_1", client, before.loadState("caller_1"));
    await agent.processMessage("5125550101");
    await agent.processMessage("My AC is blowing warm air, can you send someone tomorrow?");
    await agent.processMessage(`Please book ${agent.getState().availableSlots[0].slotId}`);
    expect(agent.getState().pendingAction?.type).toBe("CREATE_WORK_ORDER");
    before.saveState("caller_1", agent.getState());
    before.close();

    // "Restart": new store and new agent from the same file.
    const after = new SessionStore(path);
    const restored = new DispatchAgent("caller_1", client, after.loadState("caller_1"));
    expect(restored.getState().pendingAction?.type).toBe("CREATE_WORK_ORDER");
    await restored.processMessage("yes");
    expect(restored.getState().activeWorkOrder?.id).toMatch(/^wo_\d+$/);
    after.close();
  });

  it("keeps voice tokens across a restart and drops expired ones", () => {
    const path = join(dir, "tokens.sqlite");
    const before = new SessionStore(path);
    before.saveToken("live", { sessionId: "s1", expiresAt: Date.now() + 60_000 });
    before.saveToken("old", { sessionId: "s1", expiresAt: Date.now() - 1 });
    before.close();

    const after = new SessionStore(path);
    expect(after.getToken("live")?.sessionId).toBe("s1");
    expect(after.getToken("old")).toBeUndefined();
    expect(after.getToken("")).toBeUndefined();
    after.close();
  });

  it("works in memory when no database path is given", () => {
    const store = new SessionStore();
    expect(store.loadState("nobody")).toBeUndefined();
    store.saveToken("t", { sessionId: "s", expiresAt: Date.now() + 1000 });
    expect(store.getToken("t")?.sessionId).toBe("s");
  });
});
