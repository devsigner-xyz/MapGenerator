// @vitest-environment node

import type { Filter, SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createRelayQueryExecutor } from './relay-query-executor';

const event = {
  id: '1'.repeat(64),
  pubkey: 'a'.repeat(64),
  kind: 1,
  created_at: 100,
  tags: [],
  content: 'hello',
};

describe('relay query executor', () => {
  it('queries the supplied relays with the supplied filter and returns events unchanged', async () => {
    const filter: Filter = { kinds: [1], authors: [event.pubkey], limit: 1 };
    const querySync = vi.fn(async () => [event]);
    const executor = createRelayQueryExecutor({
      pool: { querySync } as unknown as SimplePool,
    });

    await expect(executor.query({
      relays: ['wss://relay.one'],
      filter,
    })).resolves.toEqual([event]);

    expect(querySync).toHaveBeenCalledWith(['wss://relay.one'], filter);
  });

  it('returns an empty event list without querying when no relays are supplied', async () => {
    const querySync = vi.fn(async () => [event]);
    const executor = createRelayQueryExecutor({
      pool: { querySync } as unknown as SimplePool,
    });

    await expect(executor.query({
      relays: [],
      filter: { kinds: [1] },
    })).resolves.toEqual([]);

    expect(querySync).not.toHaveBeenCalled();
  });

  it('does not swallow relay query errors silently', async () => {
    const error = new Error('relay failed');
    const executor = createRelayQueryExecutor({
      pool: {
        querySync: vi.fn(async () => {
          throw error;
        }),
      } as unknown as SimplePool,
    });

    await expect(executor.query({
      relays: ['wss://relay.one'],
      filter: { kinds: [1] },
    })).rejects.toThrow(error);
  });

  it('rejects before querying when the abort signal is already aborted', async () => {
    const querySync = vi.fn(async () => [event]);
    const abortController = new AbortController();
    abortController.abort();
    const executor = createRelayQueryExecutor({
      pool: { querySync } as unknown as SimplePool,
    });

    await expect(executor.query({
      relays: ['wss://relay.one'],
      filter: { kinds: [1] },
      signal: abortController.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(querySync).not.toHaveBeenCalled();
  });
});
