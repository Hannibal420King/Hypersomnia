import { createReadStream, promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { vortexPublicConfig } from "./public-config.mjs";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".data", "application/octet-stream"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"]
]);

const SOURCE_URL = "https://github.com/Hannibal420King/Hypersomnia/tree/vortex-v2";
const UPSTREAM_URL = "https://github.com/TeamHypersomnia/Hypersomnia";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function securityHeaders(config) {
  const vortexOrigin = config.enabled ? ` ${config.vortexOrigin}` : "";
  return {
    "Cross-Origin-Embedder-Policy": "credentialless",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${vortexOrigin}`,
      `connect-src 'self' https: wss:${vortexOrigin}`,
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
      "frame-ancestors *",
      "base-uri 'self'",
      "object-src 'none'"
    ].join("; ")
  };
}

function send(response, status, headers, body = "") {
  response.writeHead(status, headers);
  response.end(body);
}

function safeStaticPath(webRoot, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  }
  catch {
    return null;
  }

  if (decoded.includes("\0") || decoded.includes("\\")) {
    return null;
  }

  const relative = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(webRoot, relative || "Hypersomnia.html");
  const rootPrefix = `${path.resolve(webRoot)}${path.sep}`;
  return resolved.startsWith(rootPrefix) ? resolved : null;
}

async function sourcePage(noticePath) {
  const notice = await fs.readFile(noticePath, "utf8");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hypersomnia source and license</title><style>body{max-width:960px;margin:3rem auto;padding:0 1.25rem;background:#070b13;color:#e8f6ff;font:16px/1.6 system-ui,sans-serif}a{color:#55ddff}pre{white-space:pre-wrap;background:#101928;border:1px solid #28465e;border-radius:12px;padding:1.2rem}</style></head>
<body><h1>Hypersomnia source and license</h1><p>This modified network build is licensed under GNU AGPL-3.0. It comes with no warranty.</p>
<p><a href="${SOURCE_URL}">Corresponding source for the Vortex fork</a> · <a href="${UPSTREAM_URL}">Original upstream project</a> · <a href="/legal/license">Full AGPL license</a></p>
<pre>${escapeHtml(notice)}</pre></body></html>`;
}

export function createGateway(options = {}) {
  const webRoot = path.resolve(options.webRoot ?? process.env.WEB_ROOT ?? "/app/web");
  const licensePath = options.licensePath ?? "/app/notices/LICENSE.md";
  const noticePath = options.noticePath ?? "/app/notices/vortex/SOURCE_AND_ATTRIBUTION.md";
  const environment = options.environment ?? process.env;

  return http.createServer(async (request, response) => {
    const config = vortexPublicConfig(environment);
    const headers = securityHeaders(config);
    const requestUrl = new URL(request.url ?? "/", "http://gateway.invalid");

    if (requestUrl.pathname === "/health" || requestUrl.pathname === "/healthz") {
      send(response, 200, { ...headers, "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }, '{"ok":true}');
      return;
    }

    if (requestUrl.pathname === "/api/vortex/config") {
      send(response, 200, { ...headers, "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }, JSON.stringify(config));
      return;
    }

    if (requestUrl.pathname === "/legal/license") {
      try {
        const license = await fs.readFile(licensePath, "utf8");
        send(response, 200, { ...headers, "Cache-Control": "public, max-age=3600", "Content-Type": "text/plain; charset=utf-8" }, license);
      }
      catch {
        send(response, 500, { ...headers, "Content-Type": "text/plain; charset=utf-8" }, "License notice unavailable");
      }
      return;
    }

    if (requestUrl.pathname === "/legal/source") {
      try {
        const page = await sourcePage(noticePath);
        send(response, 200, { ...headers, "Cache-Control": "public, max-age=300", "Content-Type": "text/html; charset=utf-8" }, page);
      }
      catch {
        send(response, 500, { ...headers, "Content-Type": "text/plain; charset=utf-8" }, "Source notice unavailable");
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, { ...headers, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed");
      return;
    }

    let filePath = safeStaticPath(webRoot, requestUrl.pathname);
    if (!filePath) {
      send(response, 400, { ...headers, "Content-Type": "text/plain; charset=utf-8" }, "Invalid path");
      return;
    }

    try {
      let stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, "Hypersomnia.html");
        stat = await fs.stat(filePath);
      }
      if (!stat.isFile()) throw new Error("Not a file");

      response.writeHead(200, {
        ...headers,
        "Cache-Control": path.basename(filePath) === "Hypersomnia.html" ? "no-cache" : "public, max-age=3600",
        "Content-Length": stat.size,
        "Content-Type": MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
        ...(requestUrl.pathname.startsWith("/assets/") ? { "Service-Worker-Allowed": "/" } : {})
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    }
    catch {
      try {
        const fallback = path.join(webRoot, "Hypersomnia.html");
        const stat = await fs.stat(fallback);
        response.writeHead(200, { ...headers, "Cache-Control": "no-cache", "Content-Length": stat.size, "Content-Type": "text/html; charset=utf-8" });
        if (request.method === "HEAD") response.end();
        else createReadStream(fallback).pipe(response);
      }
      catch {
        send(response, 404, { ...headers, "Content-Type": "text/plain; charset=utf-8" }, "Not found");
      }
    }
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
  createGateway().listen(port, "0.0.0.0", () => {
    process.stdout.write(`Hypersomnia Vortex gateway listening on ${port}\n`);
  });
}
