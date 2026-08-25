// Freebuff preview server: serves the static site (SPA fallback) and keeps the
// local Convex backend (port 3210) alive so HTTP actions like the AgentMail
// contact-form send work in the preview. The Convex process is only spawned if
// nothing is already listening on 3210 (e.g. a platform-managed Convex session).
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const CONVEX_PORT = 3210;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function ensureConvex() {
  // If something is already serving the Convex backend, leave it alone.
  const probe = createServer();
  probe.once("error", () => {
    // Port in use => another Convex process is running; nothing to do.
    probe.close();
  });
  probe.listen(CONVEX_PORT, "127.0.0.1", () => {
    probe.close();
    // Nothing on 3210 — start the local Convex backend ourselves.
    const convex = spawn("bunx", ["convex", "dev"], {
      cwd: __dirname,
      stdio: ["ignore", "inherit", "inherit"],
    });
    convex.on("exit", (code, signal) => {
      console.log(`[convex] exited (code=${code} signal=${signal})`);
    });
  });
}

const server = createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    urlPath = "/";
  }
  if (urlPath === "/") urlPath = "/index.html";

  let filePath = path.join(__dirname, urlPath);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback — unknown paths serve the app shell.
    filePath = path.join(__dirname, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Static server listening on 0.0.0.0:${PORT}`);
  ensureConvex();
});
