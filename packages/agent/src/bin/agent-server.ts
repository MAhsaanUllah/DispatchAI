#!/usr/bin/env node
import http from "node:http";

// A real install starts empty; set SEED_DEMO_DATA=true in .env for the fictional demo. Set before the worker loads.
process.env.SEED_DEMO_DATA ??= "false";
const { handleRequest } = await import("../worker.js");
const { serveStatic } = await import("../static.js");

const port = Number(process.env.AGENT_PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const request = new Request(`http://${req.headers.host || `localhost:${port}`}${req.url || "/"}`, {
    method: req.method,
    headers,
    body: body.length > 0 ? body : undefined
  });
  const response = (await serveStatic(request)) ?? (await handleRequest(request));
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, host, () => {
  console.log(`[agent-server] listening on ${host}:${port}`);
});

// Desktop app: stop when the app that started this server is gone (signal 0 only checks that the process exists).
const parentPid = Number(process.env.PARENT_PID);
if (parentPid) {
  setInterval(() => {
    try { process.kill(parentPid, 0); } catch { process.exit(0); }
  }, 2000).unref();
}
