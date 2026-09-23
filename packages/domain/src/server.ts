import http from "node:http";
import {
  toolFailure,
  toolSuccess
} from "@dispatchai/shared";
import { DispatchService } from "./service.js";

export interface ServerOptions {
  service?: DispatchService;
  secret?: string;
  port?: number;
}

export function createDispatchServer(options: ServerOptions = {}) {
  const service = options.service ?? new DispatchService();
  const secret = options.secret ?? process.env.N8N_WEBHOOK_SECRET ?? (process.env.NODE_ENV === "test" ? "dev_secret_dispatch_2026" : "");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const method = req.method?.toUpperCase();
    const pathname = url.pathname;

    const correlationId = (req.headers["x-correlation-id"] as string) || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Helper to send JSON responses
    const sendJson = (statusCode: number, data: any) => {
      res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "x-correlation-id": correlationId
      });
      res.end(JSON.stringify(data));
    };

    // Health check
    if (method === "GET" && pathname === "/health") {
      return sendJson(200, { status: "OK", timestamp: new Date().toISOString() });
    }

    // Check Authentication (x-dispatch-secret or Bearer token)
    const headerAuth = (req.headers["x-dispatch-secret"] as string) ||
      (req.headers["authorization"] ? (req.headers["authorization"] as string).replace(/^Bearer\s+/, "") : null);

    if (!secret || headerAuth !== secret) {
      return sendJson(401, toolFailure(
        "UNAUTHORIZED",
        "Invalid or missing x-dispatch-secret authentication header",
        false,
        correlationId
      ));
    }

    if (method === "GET" && pathname === "/api/jobs") {
      return sendJson(200, toolSuccess({ jobs: Array.from(service.getStore().workOrders.values()) }, correlationId));
    }

    if (method === "GET" && pathname === "/api/notifications") {
      return sendJson(200, toolSuccess({ notifications: [...service.getStore().notifications].reverse() }, correlationId));
    }

    // Only handle POST for operational webhooks & internal endpoints
    if (method !== "POST") {
      return sendJson(405, toolFailure("METHOD_NOT_ALLOWED", "Method not allowed", false, correlationId));
    }

    // Parse JSON request body
    let body: any = {};
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf-8");
      if (rawBody.trim().length > 0) {
        body = JSON.parse(rawBody);
      }
    } catch {
      return sendJson(400, toolFailure("MALFORMED_JSON", "Failed to parse JSON body", false, correlationId));
    }

    // Route dispatching
    switch (pathname) {
      case "/api/reset": {
        if (body.confirm !== "RESET_LOCAL_DATA") {
          return sendJson(400, toolFailure("CONFIRMATION_REQUIRED", "Explicit local data reset confirmation required", false, correlationId));
        }
        service.getStore().reset();
        return sendJson(200, toolSuccess({ reset: true }, correlationId));
      }
      case "/webhook/customer-lookup":
      case "/api/internal/find-customer": {
        const result = service.findCustomer(body, correlationId);
        return sendJson(result.ok ? 200 : 400, result);
      }

      case "/webhook/check-availability":
      case "/api/internal/check-availability": {
        const result = service.checkAvailability(body, correlationId);
        return sendJson(result.ok ? 200 : 400, result);
      }

      case "/webhook/create-work-order":
      case "/api/internal/create-work-order": {
        const result = service.createWorkOrder(body, correlationId);
        return sendJson(result.ok ? 200 : 400, result);
      }

      case "/webhook/get-work-order":
      case "/api/internal/get-work-order": {
        const result = service.getWorkOrder(body, correlationId);
        return sendJson(result.ok ? 200 : 400, result);
      }

      case "/webhook/reschedule-work-order":
      case "/api/internal/reschedule-work-order": {
        const result = service.rescheduleWorkOrder(body, correlationId);
        return sendJson(result.ok ? 200 : 400, result);
      }

      case "/webhook/cancel-work-order":
      case "/api/internal/cancel-work-order": {
        const result = service.cancelWorkOrder(body, correlationId);
        return sendJson(result.ok ? 200 : 400, result);
      }

      case "/webhook/automation/work-order-created": {
        // Showcase automation endpoint
        const isHvac = body.serviceType === "HVAC";
        return sendJson(200, {
          ok: true,
          data: {
            automation: "work-order-created-showcase",
            confirmationId: `conf_${body.id || Date.now()}`,
            serviceCategory: isHvac ? "HVAC" : "PLUMBING",
            customerNoticeStatus: "DISPATCHED_MOCK",
            dispatchNoticeStatus: "POSTED_MOCK",
            loggedAt: new Date().toISOString()
          },
          correlationId
        });
      }

      default:
        return sendJson(404, toolFailure("NOT_FOUND", `Endpoint ${pathname} not found`, false, correlationId));
    }
  });

  return { server, service };
}
