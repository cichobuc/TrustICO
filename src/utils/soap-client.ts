/**
 * SOAP client wrapper for IS REPLIK (replik-ws.justice.sk).
 *
 * Uses the `soap` npm package. Creates clients lazily and caches them.
 * Includes timeout (8s), rate limiting (20 req/min), and retry (1 retry with backoff)
 * to mirror the HttpClient cross-cutting concerns.
 */

import { createClientAsync, type Client } from "soap";
import { SOURCE_RATE_LIMITS } from "../types/common.types.js";
import { TokenBucket } from "./rate-limiter.js";

const REPLIK_WSDL_BASE = "https://replik-ws.justice.sk/replik";

const KONANIE_WSDL = `${REPLIK_WSDL_BASE}/konanieService?wsdl`;
const OZNAM_WSDL = `${REPLIK_WSDL_BASE}/oznamService?wsdl`;

const SOAP_TIMEOUT_MS = 8_000;
const SOAP_RETRIES = 1;
const BACKOFF_BASE_MS = 500;

const replikBucket = new TokenBucket(
  SOURCE_RATE_LIMITS["replik"] ?? { maxTokens: 20, intervalMs: 60_000 },
);

// --- WSDL client cache (promise-based to prevent race conditions) ---

const clientPromises = new Map<string, Promise<Client>>();

function getClient(wsdlUrl: string): Promise<Client> {
  let p = clientPromises.get(wsdlUrl);
  if (!p) {
    p = createClientAsync(wsdlUrl, {
      wsdl_options: { timeout: SOAP_TIMEOUT_MS },
    }).catch((err) => {
      clientPromises.delete(wsdlUrl); // allow retry on WSDL fetch failure
      throw err;
    });
    clientPromises.set(wsdlUrl, p);
  }
  return p;
}

// --- Timeout helper ---

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`SOAP request timed out after ${ms}ms`)), ms),
  );
}

// --- Core SOAP call with timeout, rate limiting, and retry ---

async function callService<T>(
  wsdlUrl: string,
  operation: string,
  args: Record<string, unknown>,
): Promise<T> {
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

      const callPromise = (client as Record<string, (...a: unknown[]) => Promise<unknown[]>>)[methodName](args);
      const [result] = await Promise.race([callPromise, timeoutPromise(SOAP_TIMEOUT_MS)]);
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
