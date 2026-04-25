// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createAuthorRelayDirectory, selectReadRelays } from './author-relay-directory';
import type { RelayQueryExecutor } from './relay-query-executor';

const AUTHOR_PUBKEY = 'a'.repeat(64);

describe('createAuthorRelayDirectory', () => {
  it('prefers kind 10002 relay metadata and caches by author', async () => {
    const querySync = vi.fn(async () => [
      {
        id: '1'.repeat(64),
        pubkey: AUTHOR_PUBKEY,
        kind: 10002,
        created_at: 200,
        tags: [
          ['r', 'wss://relay.read', 'read'],
          ['r', 'wss://relay.write', 'write'],
          ['r', 'wss://relay.both'],
        ],
        content: '',
      },
    ]);
    const pool = { querySync } as unknown as SimplePool;
    const directory = createAuthorRelayDirectory({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
    });

    await expect(directory.getAuthorReadRelays(AUTHOR_PUBKEY)).resolves.toEqual([
      'wss://relay.both',
      'wss://relay.read',
    ]);
    await expect(directory.getAuthorWriteRelays(AUTHOR_PUBKEY)).resolves.toEqual([
      'wss://relay.both',
      'wss://relay.write',
    ]);

    expect(querySync).toHaveBeenCalledTimes(1);
    expect(querySync).toHaveBeenCalledWith(
      ['wss://bootstrap.one'],
      expect.objectContaining({
        authors: [AUTHOR_PUBKEY],
        kinds: [10002],
        limit: 1,
      }),
    );
  });

  it('falls back to kind 3 relay hints when kind 10002 is unavailable', async () => {
    const querySync = vi
      .fn()
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [
        {
          id: '2'.repeat(64),
          pubkey: AUTHOR_PUBKEY,
          kind: 3,
          created_at: 100,
          tags: [],
          content: JSON.stringify({
            'wss://relay.hint.one': { read: true, write: true },
            'wss://relay.hint.two': { read: true },
          }),
        },
      ]);
    const pool = { querySync } as unknown as SimplePool;
    const directory = createAuthorRelayDirectory({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
    });

    await expect(directory.getAuthorReadRelays(AUTHOR_PUBKEY)).resolves.toEqual([
      'wss://relay.hint.one',
      'wss://relay.hint.two',
    ]);
    await expect(directory.getAuthorWriteRelays(AUTHOR_PUBKEY)).resolves.toEqual([
      'wss://relay.hint.one',
    ]);

    expect(querySync).toHaveBeenCalledTimes(2);
    expect(querySync).toHaveBeenNthCalledWith(
      2,
      ['wss://bootstrap.one'],
      expect.objectContaining({
        authors: [AUTHOR_PUBKEY],
        kinds: [3],
        limit: 1,
      }),
    );
  });

  it('uses an injected relay query executor for metadata lookups', async () => {
    const query = vi.fn(async <TEvent>(request: { filter: { kinds?: number[] } }) => {
      if (request.filter.kinds?.[0] === 10002) {
        return [
          {
            id: '3'.repeat(64),
            pubkey: AUTHOR_PUBKEY,
            kind: 10002,
            created_at: 200,
            tags: [['r', 'wss://relay.read', 'read']],
            content: '',
          } as TEvent,
        ];
      }

      return [];
    });
    const pool = { querySync: vi.fn(async () => []) } as unknown as SimplePool;
    const directory = createAuthorRelayDirectory({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
      relayQueryExecutor: { query: query as RelayQueryExecutor['query'] },
    });

    await expect(directory.getAuthorReadRelays(AUTHOR_PUBKEY)).resolves.toEqual(['wss://relay.read']);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      relays: ['wss://bootstrap.one'],
      filter: expect.objectContaining({
        authors: [AUTHOR_PUBKEY],
        kinds: [10002],
      }),
    }));
    expect(pool.querySync).not.toHaveBeenCalled();
  });
});

describe('selectReadRelays', () => {
  it('uses bootstrap relays when authors are invalid and no scoped relays are available', async () => {
    await expect(selectReadRelays({
      authors: ['not-a-pubkey'],
      bootstrapRelays: ['wss://bootstrap.one'],
    })).resolves.toEqual(['wss://bootstrap.one']);
  });

  it('prefers discovered author read relays for valid authors', async () => {
    const authorRelayDirectory = {
      getAuthorReadRelays: vi.fn(async () => ['wss://relay.two', 'wss://relay.one']),
      getAuthorWriteRelays: vi.fn(async () => []),
    };

    await expect(selectReadRelays({
      authors: [AUTHOR_PUBKEY],
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory,
    })).resolves.toEqual(['wss://relay.one', 'wss://relay.two']);

    expect(authorRelayDirectory.getAuthorReadRelays).toHaveBeenCalledWith(AUTHOR_PUBKEY);
  });

  it('dedupes scoped and discovered relays in deterministic order', async () => {
    const authorRelayDirectory = {
      getAuthorReadRelays: vi.fn(async () => ['wss://relay.two', 'wss://relay.one']),
      getAuthorWriteRelays: vi.fn(async () => []),
    };

    await expect(selectReadRelays({
      authors: [AUTHOR_PUBKEY],
      scopedReadRelays: ['wss://relay.two', 'wss://relay.scoped'],
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory,
    })).resolves.toEqual(['wss://relay.one', 'wss://relay.scoped', 'wss://relay.two']);
  });
});
