import { DurableObject } from "cloudflare:workers";
import { DispatchService } from "../../domain/src/service.js";
import { DispatchStore, type Snapshot } from "../../domain/src/store.js";
import { getDirectory } from "../../domain/src/directory.js";
import { toolFailure, toolSuccess } from "@dispatchai/shared";

// One coordination atom per demo company: slot reservations and idempotency stay serialized.
export class DispatchBusinessStore extends DurableObject {
  private service: DispatchService;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS dispatch_state (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot TEXT NOT NULL)");
    const row = ctx.storage.sql.exec<{ snapshot: string }>("SELECT snapshot FROM dispatch_state WHERE id = 1").toArray()[0];
    const store = new DispatchStore(row ? JSON.parse(row.snapshot) as Snapshot : undefined, (snapshot) => {
      ctx.storage.sql.exec("INSERT INTO dispatch_state (id, snapshot) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot", JSON.stringify(snapshot));
    });
    this.service = new DispatchService(store);
  }

  operate(path: string, body: unknown, correlationId: string) {
    switch (path) {
      case "/api/internal/find-customer": return this.service.findCustomer(body, correlationId);
      case "/api/internal/check-availability": return this.service.checkAvailability(body, correlationId);
      case "/api/internal/create-work-order": return this.service.createWorkOrder(body, correlationId);
      case "/api/internal/get-work-order": return this.service.getWorkOrder(body, correlationId);
      case "/api/internal/reschedule-work-order": return this.service.rescheduleWorkOrder(body, correlationId);
      case "/api/internal/cancel-work-order": return this.service.cancelWorkOrder(body, correlationId);
      default: return toolFailure("NOT_FOUND", "Unknown operation", false, correlationId);
    }
  }

  read(path: string, correlationId: string) {
    const store = this.service.getStore();
    if (path === "/api/jobs") return toolSuccess({ jobs: [...store.workOrders.values()] }, correlationId);
    if (path === "/api/directory") return toolSuccess(getDirectory(store), correlationId);
    if (path === "/api/notifications") return toolSuccess({ notifications: [...store.notifications].reverse() }, correlationId);
    return toolFailure("NOT_FOUND", "Unknown resource", false, correlationId);
  }
}
