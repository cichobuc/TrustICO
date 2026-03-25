/**
 * Token Bucket rate limiter — shared by HTTP client and SOAP client.
 */

import type { RateLimitConfig } from "../types/common.types.js";

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
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    // Wait until next token is available — compute exact wait time
    const deficit = 1 - this.tokens;
    const waitMs = (deficit / this.maxTokens) * this.intervalMs;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = (elapsed / this.intervalMs) * this.maxTokens;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}
