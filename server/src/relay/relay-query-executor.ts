import type { Filter, SimplePool } from 'nostr-tools';

export interface RelayQueryRequest {
  relays: string[];
  filter: Filter;
  cacheKey?: string;
  signal?: AbortSignal;
}

export interface RelayQueryExecutor {
  query<TEvent>(request: RelayQueryRequest): Promise<TEvent[]>;
}

export interface CreateRelayQueryExecutorOptions {
  pool: SimplePool;
}

const createAbortError = (): Error => {
  const error = new Error('Relay query aborted before execution');
  error.name = 'AbortError';
  return error;
};

export const createRelayQueryExecutor = (
  options: CreateRelayQueryExecutorOptions,
): RelayQueryExecutor => {
  return {
    async query<TEvent>(request: RelayQueryRequest): Promise<TEvent[]> {
      if (request.signal?.aborted) {
        throw createAbortError();
      }

      if (request.relays.length === 0) {
        return [];
      }

      return options.pool.querySync(request.relays, request.filter) as Promise<TEvent[]>;
    },
  };
};
