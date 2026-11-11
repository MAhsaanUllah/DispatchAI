import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2"
};

// Built dashboard (npm run build --workspace=@dispatchai/web). WEB_DIST overrides it, e.g. in the Docker image.
const defaultRoot = fileURLToPath(new URL("../../web/dist", import.meta.url));

// Inline styles are used across the React UI; scripts only from this origin. Fonts come from Google Fonts (index.html).
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin"
};

async function file(path: string): Promise<Response | null> {
  try {
    const type = TYPES[extname(path)] ?? "application/octet-stream";
    return new Response(await readFile(path), { headers: { "Content-Type": type, ...SECURITY_HEADERS } });
  } catch {
    return null;
  }
}

// Serves the dashboard for every non-API GET. Returns null to let the API handler answer.
export async function serveStatic(request: Request, root = process.env.WEB_DIST || defaultRoot): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET" || pathname.startsWith("/api/") || pathname === "/health") return null;
  const base = resolve(root);
  const target = resolve(base, "." + decodeURIComponent(pathname));
  if (target !== base && !target.startsWith(base + sep)) return new Response("Not Found", { status: 404 });
  if (extname(target)) return (await file(target)) ?? new Response("Not Found", { status: 404 });
  // SPA route such as /app: send index.html.
  return (await file(resolve(base, "index.html"))) ?? new Response("Dashboard not built. Run npm run build --workspace=@dispatchai/web", { status: 503 });
}
