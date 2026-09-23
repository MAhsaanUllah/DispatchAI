#!/usr/bin/env node
import http from "node:http";
import { handleRequest } from "../worker.js";

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
  const response = await handleRequest(request);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, host, () => {
  console.log(`[agent-server] listening on ${host}:${port}`);
});
