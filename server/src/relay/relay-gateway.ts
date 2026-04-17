import { createTTLCache, type TTLCache } from '../cache/ttl-cache';

import type {
  RelayGateway,
  RelayGatewayError,
  RelayGatewayOptions,
  RelayGatewayQueryInput,
} from './relay-gateway.types';

const TIMEOUT_ERROR_NAME = 'TimeoutError';
const TIMEOUT_ERROR_CODE = 'ETIMEDOUT';

const createTimeoutError = (timeoutMs: number): RelayGatewayError => {
  const error = new Error(`Relay query timed out after ${timeoutMs}ms`) as RelayGatewayError;
  error.name = TIMEOUT_ERROR_NAME;
  error.code = TIMEOUT_ERROR_CODE;
  error.recoverable = true;
  error.kind = 'timeout';
  return error;
};

export const isRelayGatewayTimeoutError = (error: unknown): error is RelayGatewayError => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typedError = error as RelayGatewayError;
  return (
    typedError.kind === 'timeout' ||
    typedError.code === TIMEOUT_ERROR_CODE ||
    typedError.name === TIMEOUT_ERROR_NAME
  );
};

const withTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs?: number,
  externalSignal?: AbortSignal,
): Promise<T> => {
  if (externalSignal?.aborted) {
    const abortError = new Error('Relay query aborted before execution') as RelayGatewayError;
    abortError.name = 'AbortError';
    abortError.code = 'EABORTED';
    abortError.kind = 'upstream';
    abortError.recoverable = false;
    throw abortError;
  }

  if (timeoutMs === undefined) {
    const controller = new AbortController();

    const onAbort = () => {
      controller.abort(externalSignal?.reason);
    };

    externalSignal?.addEventListener('abort', onAbort, { once: true });

    try {
      return await run(controller.signal);
    } finally {
      externalSignal?.removeEventListener('abort', onAbort);
    }
  }

  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const onAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  externalSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const timeoutError = createTimeoutError(timeoutMs);
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    });

    return await Promise.race([run(controller.signal), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    externalSignal?.removeEventListener('abort', onAbort);
  }
};

export const createRelayGateway = <TParams, TResult>(
  options: RelayGatewayOptions<TParams, TResult>,
): RelayGateway<TParams, TResult> => {
  const inflight = new Map<string, Promise<TResult>>();
  const cache: TTLCache<string, TResult> | null = options.cache
    ? createTTLCache<string, TResult>({
        ttlMs: options.cache.ttlMs,
        maxEntries: options.cache.maxEntries,
        now: options.now,
      })
    : null;

  const query = (input: RelayGatewayQueryInput<TParams>): Promise<TResult> => {
    if (!input.bypassCache && cache) {
      const cached = cache.get(input.key);
      if (cached !== undefined) {
        return Promise.resolve(cached);
      }
    }

    const shouldDedupe = input.dedupe ?? true;
    if (shouldDedupe) {
      const existing = inflight.get(input.key);
      if (existing) {
        return existing;
      }
    }

    const requestPromise = withTimeout(
      (signal) => options.queryFn(input.params, { signal }),
      input.timeoutMs ?? options.defaultTimeoutMs,
      input.signal,
    )
      .then((result) => {
        if (!input.bypassCache && cache) {
          cache.set(input.key, result, input.cacheTtlMs);
        }

        return result;
      })
      .finally(() => {
        inflight.delete(input.key);
      });

    if (shouldDedupe) {
      inflight.set(input.key, requestPromise);
    }

    return requestPromise;
  };

  return {
    query,
    clearCache: () => {
      cache?.clear();
    },
  };
};
