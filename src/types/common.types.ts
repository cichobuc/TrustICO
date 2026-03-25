/**
 * Common types shared across all adapters and tools.
 */

/** Result wrapper returned by every adapter method. */
export type AdapterResult<T> = {
  found: boolean;
  data?: T;
  error?: string;
  durationMs: number;
  source: string;
};

/** Metadata attached to every MCP tool response. */
export type MetaInfo = {
  source: string;
  durationMs: number;
  timestamp: string;
};

/** Status of a single data source in multi-source orchestration. */
export type ZdrojStatus = {
  source: string;
  found: boolean;
  durationMs: number;
  error?: string;
};

/** Rate limit configuration for a data source. */
export type RateLimitConfig = {
  /** Maximum requests allowed per interval. */
  maxTokens: number;
  /** Interval in milliseconds for token refill. */
  intervalMs: number;
};

/** HTTP client request options. */
export type HttpRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Number of retries (default 1). */
  retries?: number;
  /** Source name for rate limiting. */
  source?: string;
  /** If true, return raw Buffer instead of parsed text/json. */
  raw?: boolean;
};

/** HTTP client response. */
export type HttpResponse<T = unknown> = {
  status: number;
  headers: Record<string, string>;
  data: T;
  durationMs: number;
};

/** Per-source rate limit presets (from CLAUDE.md). */
export const SOURCE_RATE_LIMITS: Record<string, RateLimitConfig> = {
  rpo: { maxTokens: 12, intervalMs: 60_000 },
  ruz: { maxTokens: 30, intervalMs: 60_000 },
  rpvs: { maxTokens: 20, intervalMs: 60_000 },
  finspr: { maxTokens: 15, intervalMs: 60_000 },
  datahub: { maxTokens: 50, intervalMs: 60_000 },
  itms: { maxTokens: 30, intervalMs: 60_000 },
  replik: { maxTokens: 20, intervalMs: 60_000 },
  vies: { maxTokens: 10, intervalMs: 60_000 },
};
