import "dotenv/config";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createMcpServer } from "./server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./utils/logger.js";
import { checkHealth } from "./utils/health.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const MCP_API_KEY = process.env.MCP_API_KEY;

if (!MCP_API_KEY) {
  logger.warn("MCP_API_KEY not set — authentication disabled");
}

const transports = new Map<string, StreamableHTTPServerTransport>();
const sessionLastActivity = new Map<string, number>();

/** Session TTL — clean up abandoned sessions after 30 minutes of inactivity. */
const SESSION_TTL_MS = 30 * 60 * 1000;

/** Periodic cleanup of stale sessions (runs every 5 minutes). */
setInterval(() => {
  const now = Date.now();
  for (const [id, lastActivity] of sessionLastActivity) {
    if (now - lastActivity > SESSION_TTL_MS) {
      const transport = transports.get(id);
      if (transport) {
        try { transport.close(); } catch { /* ignore */ }
      }
      transports.delete(id);
      sessionLastActivity.delete(id);
      logger.info("Cleaned up stale session", { sessionId: id });
    }
  }
}, 5 * 60 * 1000).unref();

/** Verify Bearer token from Authorization header. */
function authenticate(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): boolean {
  if (!MCP_API_KEY) return true; // No key configured — skip auth

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing or invalid Authorization header" }));
    return false;
  }

  const token = authHeader.slice(7);
  const tokenBuf = Buffer.from(token);
  const keyBuf = Buffer.from(MCP_API_KEY);
  if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid API key" }));
    return false;
  }

  return true;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Attach CORS headers to all responses
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }

  // Health check — no auth required
  if (req.method === "GET" && url.pathname === "/health") {
    try {
      const health = await checkHealth();
      const statusCode = health.status === "ok" ? 200 : health.status === "degraded" ? 200 : 503;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
    } catch (err) {
      logger.error("health check failed", { error: err instanceof Error ? err.message : String(err) });
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "down", error: "Health check failed" }));
    }
    return;
  }

  // MCP endpoint — auth required
  if (url.pathname === "/mcp") {
    if (!authenticate(req, res)) return;
    if (req.method === "POST") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
        sessionLastActivity.set(sessionId, Date.now());
      } else if (!sessionId) {
        // New session — parse body to check if it's an initialize request
        const body = await readBody(req);
        let message: unknown;
        try {
          message = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Malformed JSON in request body" }));
          return;
        }

        if (isInitializeRequest(message)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id) => {
              transports.set(id, transport);
              sessionLastActivity.set(id, Date.now());
            },
          });

          transport.onclose = () => {
            const id = [...transports.entries()].find(([, t]) => t === transport)?.[0];
            if (id) {
              transports.delete(id);
              sessionLastActivity.delete(id);
            }
          };

          // Create a fresh McpServer per session to avoid shared state
          const sessionServer = createMcpServer();
          await sessionServer.connect(transport);
          await transport.handleRequest(req, res, message);
          return;
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing session ID for non-initialize request" }));
          return;
        }
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      await transport.handleRequest(req, res);
      return;
    }

    if (req.method === "GET") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing or invalid session ID" }));
      return;
    }

    if (req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
  }

  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

httpServer.listen(PORT, () => {
  logger.info("TrustICO MCP server started", {
    port: PORT,
    health: `http://localhost:${PORT}/health`,
    mcp: `http://localhost:${PORT}/mcp`,
  });
});
