/**
 * SOAP client wrapper for IS REPLIK (replik-ws.justice.sk).
 *
 * Uses the `soap` npm package. Creates clients lazily and caches them.
 * Includes timeout (8s), rate limiting (20 req/min), and retry (1 retry with backoff)
 * to mirror the HttpClient cross-cutting concerns.
 */

import { createClientAsync, type Client } from "soap";
import { SOURCE_RATE_LIMITS } from "../types/common.types.js";
import { TokenBucket } from "./http-client.js";

// IS REPLIK v2 (od 1.10.2025) — nový path /ru-verejnost-ws/ a .wsdl suffix
const REPLIK_WSDL_BASE = "https://replik-ws.justice.sk/ru-verejnost-ws";

const KONANIE_WSDL = `${REPLIK_WSDL_BASE}/konanieService.wsdl`;
const OZNAM_WSDL = `${REPLIK_WSDL_BASE}/oznamService.wsdl`;

const SOAP_TIMEOUT_MS = 8_000;
const SOAP_RETRIES = 1;
const BACKOFF_BASE_MS = 500;

/**
 * Fetch and validate WSDL URL. Returns the WSDL XML body for reuse.
 * Throws a descriptive error if the response is HTML or invalid.
 */
async function fetchAndValidateWsdl(wsdlUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOAP_TIMEOUT_MS);
  try {
    const resp = await fetch(wsdlUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "text/xml, application/xml" },
    });

    if (!resp.ok) {
      throw new Error(
        `IS REPLIK WSDL vrátil HTTP ${resp.status} ${resp.statusText}. ` +
        `Server pravdepodobne vyžaduje autentifikáciu alebo je nedostupný.`,
      );
    }

    const contentType = resp.headers.get("content-type") ?? "";
    const body = await resp.text();

    // Check if response is HTML instead of XML
    if (
      contentType.includes("text/html") ||
      body.trimStart().startsWith("<!DOCTYPE") ||
      body.trimStart().startsWith("<html")
    ) {
      throw new Error(
        `IS REPLIK WSDL vrátil HTML namiesto XML (Content-Type: ${contentType}). ` +
        `Server pravdepodobne vrátil login stránku alebo chybovú stránku. ` +
        `Skontrolujte prístupové údaje a sieťovú konektivitu k replik-ws.justice.sk.`,
      );
    }

    // Verify it looks like XML/WSDL
    if (!body.includes("<wsdl:") && !body.includes("<definitions") && !body.includes("<?xml")) {
      throw new Error(
        `IS REPLIK WSDL response nie je platný WSDL XML dokument. ` +
        `Content-Type: ${contentType}. Skontrolujte URL a konektivitu k replik-ws.justice.sk.`,
      );
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
}

// --- Rate limiting (using shared TokenBucket from http-client) ---

const replikBucket = new TokenBucket(
  SOURCE_RATE_LIMITS["replik"] ?? { maxTokens: 20, intervalMs: 60_000 },
);

// --- WSDL client cache (promise-based to prevent race conditions) ---

const clientPromises = new Map<string, Promise<Client>>();

function getClient(wsdlUrl: string): Promise<Client> {
  let p = clientPromises.get(wsdlUrl);
  if (!p) {
    p = (async () => {
      // Pre-validate WSDL — catches HTML login pages, auth errors, etc.
      // with clear error messages. Double-fetch is acceptable: cached once per service.
      await fetchAndValidateWsdl(wsdlUrl);
      return createClientAsync(wsdlUrl, {
        wsdl_options: { timeout: SOAP_TIMEOUT_MS },
      });
    })().catch((err) => {
      clientPromises.delete(wsdlUrl); // allow retry on WSDL fetch failure
      throw err;
    });
    clientPromises.set(wsdlUrl, p);
  }
  return p;
}

// --- Timeout helper ---

function withSoapTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SOAP request timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// --- Input sanitization ---

/** Strip XML special characters from SOAP arguments to prevent injection (recursive). */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Remove XML special chars and control characters
    // eslint-disable-next-line no-control-regex
    return value.replace(/[<>&'"]/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    return sanitizeArgs(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    sanitized[key] = sanitizeValue(value);
  }
  return sanitized;
}

// --- Core SOAP call with timeout, rate limiting, and retry ---

async function callService<T>(
  wsdlUrl: string,
  operation: string,
  args: Record<string, unknown>,
): Promise<T> {
  const safeArgs = sanitizeArgs(args);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= SOAP_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }

    await replikBucket.acquire();

    try {
      const client = await getClient(wsdlUrl);
      const methodName = `${operation}Async`;
      if (typeof (client as Record<string, unknown>)[methodName] !== "function") {
        throw new Error(`SOAP operation ${operation} not found`);
      }

      const callPromise = (client as Record<string, (...a: unknown[]) => Promise<unknown[]>>)[methodName](safeArgs);
      const [result] = await withSoapTimeout(callPromise, SOAP_TIMEOUT_MS);
      return result as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Non-retryable: operation not found
      if (lastError.message.includes("not found")) throw lastError;
      continue;
    }
  }

  throw lastError ?? new Error(`SOAP call to ${operation} failed`);
}

/** Call a SOAP operation on the konanieService. */
export const callKonanieService = <T>(operation: string, args: Record<string, unknown>): Promise<T> =>
  callService<T>(KONANIE_WSDL, operation, args);

/** Call a SOAP operation on the oznamService. */
export const callOznamService = <T>(operation: string, args: Record<string, unknown>): Promise<T> =>
  callService<T>(OZNAM_WSDL, operation, args);
