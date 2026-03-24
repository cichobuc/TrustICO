/**
 * In-memory LRU cache with TTL support.
 * Primary use: caching RUZ template (šablóna) lookups.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  /**
   * @param maxSize Maximum number of entries (default 100).
   * @param ttlMs Time-to-live in milliseconds (default 1 hour).
   */
  constructor(maxSize = 100, ttlMs = 3_600_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // Delete first so re-insert moves to end
    this.map.delete(key);

    // Evict oldest if at capacity
    if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value!;
      this.map.delete(oldestKey);
    }

    this.map.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.ttlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
