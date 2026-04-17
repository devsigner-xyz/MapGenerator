import type { FastifyPluginAsync } from 'fastify';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;
const DEFAULT_MAX_STORE_ENTRIES = 10_000;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RouteRateLimitConfig = {
  max?: unknown;
  windowMs?: unknown;
};

const parsePositiveInt = (
  rawValue: string | undefined,
  fallback: number,
): number => {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parsePositiveIntUnknown = (rawValue: unknown, fallback: number): number => {
  if (typeof rawValue === 'number') {
    if (!Number.isInteger(rawValue) || rawValue <= 0) {
      return fallback;
    }

    return rawValue;
  }

  if (typeof rawValue === 'string') {
    return parsePositiveInt(rawValue, fallback);
  }

  return fallback;
};

export const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  const windowMs = parsePositiveInt(
    process.env.BFF_RATE_LIMIT_WINDOW_MS,
    DEFAULT_WINDOW_MS,
  );
  const maxRequests = parsePositiveInt(
    process.env.BFF_RATE_LIMIT_MAX,
    DEFAULT_MAX_REQUESTS,
  );
  const maxStoreEntries = parsePositiveInt(
    process.env.BFF_RATE_LIMIT_MAX_STORE_ENTRIES,
    DEFAULT_MAX_STORE_ENTRIES,
  );
  const store = new Map<string, RateLimitEntry>();
  let lastSweepAt = 0;

  const sweepExpiredEntries = (now: number): void => {
    for (const [key, entry] of store.entries()) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }

    lastSweepAt = now;
  };

  const trimStore = (): void => {
    while (store.size > maxStoreEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }

      store.delete(oldestKey);
    }
  };

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      return;
    }

    const routeRateLimitConfig = (request.routeOptions.config as { rateLimit?: RouteRateLimitConfig } | undefined)?.rateLimit;

    const effectiveWindowMs = parsePositiveIntUnknown(
      routeRateLimitConfig?.windowMs,
      windowMs,
    );

    const effectiveMaxRequests = parsePositiveIntUnknown(
      routeRateLimitConfig?.max,
      maxRequests,
    );

    const now = Date.now();
    if (now - lastSweepAt >= Math.min(windowMs, effectiveWindowMs)) {
      sweepExpiredEntries(now);
    }

    const key = `${request.ip}:${request.routeOptions.url}:${effectiveWindowMs}:${effectiveMaxRequests}`;
    const existingEntry = store.get(key);

    if (!existingEntry || now >= existingEntry.resetAt) {
      store.set(key, {
        count: 1,
        resetAt: now + effectiveWindowMs,
      });
      trimStore();
      return;
    }

    existingEntry.count += 1;

    if (existingEntry.count <= effectiveMaxRequests) {
      return;
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existingEntry.resetAt - now) / 1000),
    );

    reply.header('retry-after', `${retryAfterSeconds}`);

    const error = new Error('Rate limit exceeded') as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = 429;
    error.code = 'RATE_LIMITED';
    throw error;
  });
};

(rateLimitPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
