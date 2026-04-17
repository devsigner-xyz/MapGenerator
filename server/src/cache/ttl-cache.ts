export interface TTLCacheOptions {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

export interface TTLCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V, ttlMs?: number): void;
  delete(key: K): boolean;
  clear(): void;
  size(): number;
}

class InMemoryTTLCache<K, V> implements TTLCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>();
  private readonly now: () => number;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    now?: () => number,
  ) {
    this.now = now ?? Date.now;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAtMs <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.maxEntries <= 0) {
      return;
    }

    const effectiveTtlMs = Math.max(0, ttlMs ?? this.ttlMs);
    const expiresAtMs = this.now() + effectiveTtlMs;

    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    this.entries.set(key, {
      value,
      expiresAtMs,
    });

    this.evictIfNeeded();
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    this.pruneExpired();
    return this.entries.size;
  }

  private pruneExpired(): void {
    const now = this.now();

    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAtMs <= now) {
        this.entries.delete(key);
      }
    }
  }

  private evictIfNeeded(): void {
    this.pruneExpired();

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }

      this.entries.delete(oldestKey);
    }
  }
}

export const createTTLCache = <K, V>(options: TTLCacheOptions): TTLCache<K, V> => {
  return new InMemoryTTLCache<K, V>(options.ttlMs, options.maxEntries, options.now);
};
