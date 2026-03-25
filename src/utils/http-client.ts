/**
 * HTTP client wrapper with retry, timeout, and per-source rate limiting.
 */

import {
  type HttpRequestOptions,
  type HttpResponse,
  type RateLimitConfig,
  SOURCE_RATE_LIMITS,
} from "../types/common.types.js";

// --- Token Bucket Rate Limiter ---

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly intervalMs: number;

  constructor(config: RateLimitConfig) {
    this.maxTokens = config.maxTokens;
    this.intervalMs = config.intervalMs;
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    const waitMs = this.intervalMs / this.maxTokens;
    // Loop until a token is available — prevents bypass under sustained load
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens--;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = (elapsed / this.intervalMs) * this.maxTokens;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

// --- SSRF Protection ---

const ALLOWED_HOSTS = new Set([
  "api.statistics.sk",
  "www.registeruz.sk",
  "registeruz.sk",
  "rpvs.gov.sk",
  "iz.opendata.financnasprava.sk",
  "ec.europa.eu",
  "replik-ws.justice.sk",
  "data.slovensko.digital",
  "opendata.itms2014.sk",
]);

function validateRequestUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Disallowed protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`Request to disallowed host: ${hostname}`);
  }
}

// --- HTTP Client ---

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 1;
const BACKOFF_BASE_MS = 500;

const buckets = new Map<string, TokenBucket>();

function getBucket(source: string): TokenBucket {
  let bucket = buckets.get(source);
  if (!bucket) {
    const config = SOURCE_RATE_LIMITS[source] ?? {
      maxTokens: 30,
      intervalMs: 60_000,
    };
    bucket = new TokenBucket(config);
    buckets.set(source, bucket);
  }
  return bucket;
}

export class HttpClient {
  /**
   * Make an HTTP request with retry, timeout, and rate limiting.
   */
  async request<T = unknown>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const {
      method = "GET",
      headers = {},
      body,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      retries = DEFAULT_RETRIES,
      source,
      raw = false,
    } = options;

    // SSRF protection — only allow known API hosts
    validateRequestUrl(url);

    // Rate limiting
    if (source) {
      await getBucket(source).acquire();
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));

        // Re-acquire rate limit token on retry
        if (source) {
          await getBucket(source).acquire();
        }
      }

      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ?? undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        // Handle 429 Too Many Requests — wait and retry
        if (response.status === 429 && attempt < retries) {
          const retryAfter = response.headers.get("retry-after");
          const waitMs = retryAfter
            ? Math.min(parseInt(retryAfter, 10) * 1000 || 2000, 5000)
            : 2000;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        const durationMs = Date.now() - start;

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        let data: T;
        if (raw) {
          const arrayBuffer = await response.arrayBuffer();
          data = Buffer.from(arrayBuffer) as T;
        } else {
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("/json") || contentType.includes("+json")) {
            data = (await response.json()) as T;
          } else {
            data = (await response.text()) as T;
          }
        }

        return {
          status: response.status,
          headers: responseHeaders,
          data,
          durationMs,
        };
      } catch (err) {
        clearTimeout(timer);
        lastError =
          err instanceof Error ? err : new Error(String(err));

        // Retry on transient errors (timeouts, network errors)
        if (lastError.name === "AbortError") {
          lastError = new Error(
            `Request to ${url} timed out after ${timeoutMs}ms`,
          );
        }
        // All errors are retryable (max 1 retry with backoff)
        continue;
      }
    }

    throw lastError ?? new Error(`Request to ${url} failed`);
  }

  /** Convenience GET method. */
  async get<T = unknown>(
    url: string,
    options: Omit<HttpRequestOptions, "method"> = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: "GET" });
  }

  /** Convenience POST method. */
  async post<T = unknown>(
    url: string,
    body: unknown,
    options: Omit<HttpRequestOptions, "method" | "body"> = {},
  ): Promise<HttpResponse<T>> {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    return this.request<T>(url, {
      ...options,
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }
}
