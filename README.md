# DispatchAI

![Status: Work in Progress](https://img.shields.io/badge/Status-Work%20in%20Progress-amber)

**Voice-assisted dispatch for HVAC and plumbing operations.** DispatchAI brings customer intake, technician availability, work-order scheduling, and dispatcher review into one system. It is a portfolio project built around a realistic Austin, Texas field-service workflow.

The application combines a React operations dashboard, an ElevenLabs conversational voice interface, authenticated n8n workflows, and a TypeScript domain service backed by SQLite. A Cloudflare Agents SDK runtime demonstrates persistent agent state and a private path from a Worker to local n8n.

**[View the Cloudflare-hosted product preview](https://dispatchai-web.itsahsaanmughal.workers.dev)** · The public site showcases the experience. Voice calls and staff operations remain available in the local demo, not on the public preview.

## Product preview

### Operations dashboard

![DispatchAI operations dashboard](assets/screenshots/dashboard.png)

### Workflow orchestration

![DispatchAI n8n workflow canvas](assets/screenshots/all-n8n-operations.png)

The merged n8n canvas contains seven flows: create work order, check availability, find customer, get work order, reschedule, cancel, and booking-created automation. Open the image at full size to inspect the connections.

## How it works

```text
Dispatcher dashboard ─┐
                      ├─→ DispatchAgent API ─→ authenticated n8n webhooks
ElevenLabs voice call ─┘                              │
                                                      ▼
                                       Domain service + SQLite
                                                      │
                                                      ▼
                                       Work orders + local outbox

Cloudflare web Worker ─→ public landing preview (static assets)
Cloudflare Agents SDK Worker ─→ private Tunnel/VPC path ─→ local n8n
```

The dashboard and voice interface use the local DispatchAgent API. Read tools retrieve customer, job, and availability data; create, reschedule, and cancel operations require explicit confirmation. n8n orchestrates the requests, while the domain service owns booking rules, persistence, idempotency, and the notification outbox. The Cloudflare Worker is a separate Agents SDK integration path, not the current dashboard API.

## Engineering highlights

- **Grounded operations:** Customer and schedule answers come from tool results rather than generated records.
- **Booking safeguards:** Confirmation before mutations, idempotency keys for repeated requests, slot-conflict checks, and protection against duplicate voice-tool booking replays.
- **Multi-turn work-order handling:** Create, look up, reschedule, and cancel a work order across turns while retaining the correct job context; ambiguous references prompt for clarification instead of guessing.
- **Truthful UI and failures:** Dashboard counts, activity, technician details, and connection status reflect available data. Backend outages are reported differently from genuine not-found results.
- **Persistent local state:** SQLite retains work orders and outbox entries across domain-service restarts.
- **Voice integration:** ElevenLabs browser sessions use a server-issued signed URL; the API key remains server-side. A pre-call form captures a name and confirmation email for the local demo.
- **Company directory and notifications:** Read-only company, technician, and service views accompany the work-order dashboard. Confirmed bookings enter a persistent notification outbox; optional email delivery requires a configured sender and real recipient.
- **Workflow security:** Shared-secret authentication between the agent and n8n, plus signature verification for incoming ElevenLabs webhooks.
- **Cloudflare integration:** A deployed Agents SDK Worker stores session state in a Durable Object and has been smoke-tested over a private Tunnel/VPC connection to local n8n. Its public route is disabled. A separate Worker hosts the public frontend preview without exposing local APIs.
- **Automated checks:** 130 passing tests across 21 files cover contracts, domain rules, workflow topology, agent tools, multi-turn routing, voice-tool replay, pre-call intake, UI states, and failure paths. All four package typechecks pass.

## Stack

| Component | Technology |
| --- | --- |
| Dashboard | React, TypeScript, Vite |
| Agent API | TypeScript, Node.js |
| Voice | ElevenLabs Conversational AI |
| Orchestration | n8n |
| Domain and persistence | TypeScript, Zod, SQLite |
| Cloud agent runtime | Cloudflare Agents SDK, Durable Objects, Tunnel/VPC Service |
| Public preview | Cloudflare Workers Static Assets |
| Tests | Vitest |

## Run locally

Requires Node.js 24+, npm, Docker Desktop, and a local n8n instance. SQLite uses Node's built-in module; no separate database server is required.

```bash
git clone https://github.com/MAhsaanUllah/DispatchAI.git
cd DispatchAI
npm install
cp .env.example .env
npm run build
```

Set the required values in `.env`, especially `N8N_WEBHOOK_SECRET`. Add `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` to enable real voice calls. Never commit `.env`.

Import `n8n/workflows/_merged_all_operations.json` into n8n. Create a Header Auth credential named `x-dispatch-secret` with the value from `.env`'s `N8N_WEBHOOK_SECRET`, attach it to the imported webhook and HTTP nodes, and publish the workflow. The HTTP nodes target `host.docker.internal:3100` when n8n runs in Docker.

Start each service in a separate terminal:

```bash
npm run dev:domain
npm run dev:agent
npm run dev
```

Open the local landing page at [http://localhost:5173](http://localhost:5173) and the staff dashboard at `/app`. The agent API runs on port `8787`, the domain service on `3100`, and n8n on `5678`. Use `npm test` and `npm run typecheck` to verify the codebase.

### Cloudflare agent path

With the local services and the configured private tunnel running, start `npm run dev:cloudflare` and run `npm run smoke:cloudflare`. This exercises the Agents SDK runtime on local port `8788`, its Durable Object state, and the private route to n8n. The deployed Worker has no public route; this path is an integration demonstration, not an always-on hosted dashboard.

### Public frontend preview

`npm run build:cloudflare --workspace=@dispatchai/web` builds a preview-safe frontend; `npm run deploy:cloudflare --workspace=@dispatchai/web` deploys it as the separate `dispatchai-web` Worker. On this public build, voice controls are disabled, `/app` explains the guided local demo, and `/api/*` returns an explicit unavailable response. The existing `dispatchai-agent` Worker is unchanged.

## Project scope and next steps

The local dashboard, operational workflows, database, and agent tool routes form the working demo. Email delivery is optional; without a configured provider, messages remain in the local outbox. A human-spoken booking and its dashboard result still need a final live rehearsal. A fully hosted operational release would additionally need authenticated staff access, always-on n8n and database hosting, backups, and a dashboard cutover to a cloud API with the complete voice and operations routes.

All names, contact details, technicians, and addresses shown in sample data or screenshots are fictional.
