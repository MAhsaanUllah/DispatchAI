#!/usr/bin/env node
/**
 * DispatchAI — Standalone Domain Server
 * 
 * Usage:
 *   tsx packages/domain/src/bin/dispatch-server.ts     # dev
 *   NODE_ENV=production tsx packages/domain/src/bin/dispatch-server.ts
 */
import { createDispatchServer } from "../server.js";
import { DispatchService } from "../service.js";
import { DispatchStore } from "../store.js";

const PORT = process.env.PORT || "3000";
const HOST = process.env.HOST || "0.0.0.0";

const { server } = createDispatchServer({
  service: new DispatchService(new DispatchStore(process.env.DATABASE_URL))
});

// Start listening
server.listen(parseInt(PORT), HOST, () => {
  console.log(`[dispatch-server] listening on ${HOST}:${PORT}`);
});
