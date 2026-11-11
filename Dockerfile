# DispatchAI: one process serves the API, the AI agent, the booking data (SQLite) and the dashboard.
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/domain/package.json packages/domain/
COPY packages/agent/package.json packages/agent/
COPY packages/web/package.json packages/web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
RUN npm run build --workspace=@dispatchai/web

# Data (SQLite, master.key) lives in /data, a volume, so upgrades keep it. Nothing secret is baked into the image.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    AGENT_PORT=8080 \
    DATABASE_URL=/data/dispatchai.sqlite \
    WEB_DIST=/app/packages/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# shortcut: runs TypeScript through vite-node (as in development); add a compile step if start-up time matters.
CMD ["node", "./node_modules/vite-node/dist/cli.mjs", "packages/agent/src/bin/agent-server.ts"]
