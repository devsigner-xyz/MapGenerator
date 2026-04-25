// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createGraphService } from './graph.service';
import type { RelayGateway } from '../../relay/relay-gateway.types';
import type { GraphFollowersQuery, GraphFollowersResponseDto, GraphFollowsQuery, GraphFollowsResponseDto } from './graph.schemas';

const OWNER_PUBKEY = 'a'.repeat(64);
const TARGET_PUBKEY = 'b'.repeat(64);
const FOLLOW_ONE = 'c'.repeat(64);
const FOLLOW_TWO = 'd'.repeat(64);

describe('graph service', () => {
  it('returns follows and relay hints from latest kind3 event', async () => {
    const querySync = vi.fn(async () => [
      {
        id: '1'.repeat(64),
        pubkey: TARGET_PUBKEY,
        created_at: 100,
        tags: [
          ['p', FOLLOW_ONE, 'wss://relay.one'],
          ['p', FOLLOW_TWO],
          ['p', FOLLOW_ONE],
        ],
        content: '',
      },
    ]);
    const pool = { querySync } as unknown as SimplePool;

    const service = createGraphService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async () => []),
      },
    });

    const result = await service.getFollows({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      scopedReadRelays: ['wss://relay.follows'],
    });

    expect(result).toEqual({
      pubkey: TARGET_PUBKEY,
      follows: [FOLLOW_ONE, FOLLOW_TWO],
      relayHints: ['wss://relay.one'],
    });
    expect(querySync).toHaveBeenCalledTimes(1);
    expect(querySync).toHaveBeenCalledWith(['wss://relay.follows'], expect.objectContaining({
      authors: [TARGET_PUBKEY],
      kinds: [3],
    }));
  });

  it('falls back to bootstrap relays when scoped follows read returns no events', async () => {
    const querySync = vi.fn(async (relays: string[]) => {
      if (relays[0] === 'wss://relay.follows') {
        return [];
      }

      return [
        {
          id: '9'.repeat(64),
          pubkey: TARGET_PUBKEY,
          created_at: 120,
          tags: [['p', FOLLOW_ONE, 'wss://relay.one']],
          content: '',
        },
      ];
    });
    const pool = { querySync } as unknown as SimplePool;

    const service = createGraphService({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async () => []),
      },
    });

    const result = await service.getFollows({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      scopedReadRelays: ['wss://relay.follows'],
    });

    expect(result).toEqual({
      pubkey: TARGET_PUBKEY,
      follows: [FOLLOW_ONE],
      relayHints: ['wss://relay.one'],
    });
    expect(querySync).toHaveBeenNthCalledWith(1, ['wss://relay.follows'], expect.any(Object));
    expect(querySync).toHaveBeenNthCalledWith(2, ['wss://bootstrap.one'], expect.any(Object));
  });

  it('does not let slow author relay discovery exhaust follows lookup timeout', async () => {
    vi.useFakeTimers();

    try {
      const querySync = vi.fn(async () => [
        {
          id: '8'.repeat(64),
          pubkey: TARGET_PUBKEY,
          created_at: 130,
          tags: [['p', FOLLOW_ONE, 'wss://relay.one']],
          content: '',
        },
      ]);
      const pool = { querySync } as unknown as SimplePool;
      const getAuthorReadRelays = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return ['wss://slow.author'];
      });

      const service = createGraphService({
        pool,
        bootstrapRelays: ['wss://bootstrap.one'],
        defaultTimeoutMs: 10,
        authorRelayDirectory: {
          getAuthorReadRelays,
          getAuthorWriteRelays: vi.fn(async () => []),
        },
      });

      const resultPromise = service.getFollows({
        ownerPubkey: OWNER_PUBKEY,
        pubkey: TARGET_PUBKEY,
      });

      await vi.advanceTimersByTimeAsync(20);

      await expect(resultPromise).resolves.toEqual({
        pubkey: TARGET_PUBKEY,
        follows: [FOLLOW_ONE],
        relayHints: ['wss://relay.one'],
      });
      expect(querySync).toHaveBeenCalledWith(['wss://bootstrap.one'], expect.objectContaining({
        authors: [TARGET_PUBKEY],
        kinds: [3],
      }));
      expect(getAuthorReadRelays).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns followers from tag scan and candidate author scan', async () => {
    const followerOne = 'e'.repeat(64);
    const followerTwo = 'f'.repeat(64);
    const querySync = vi
      .fn()
      .mockImplementationOnce(async () => [
        {
          id: '2'.repeat(64),
          pubkey: followerOne,
          created_at: 120,
          tags: [['p', TARGET_PUBKEY]],
          content: '',
        },
      ])
      .mockImplementationOnce(async () => [
        {
          id: '3'.repeat(64),
          pubkey: followerTwo,
          created_at: 115,
          tags: [['p', TARGET_PUBKEY]],
          content: '',
        },
      ]);
    const pool = { querySync } as unknown as SimplePool;

    const service = createGraphService({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async () => ['wss://candidate.scope']),
      },
    });

    const result = await service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: `${followerOne},${followerTwo}`,
      scopedReadRelays: ['wss://owner.scope'],
    });

    expect(result.pubkey).toBe(TARGET_PUBKEY);
    expect(result.followers).toEqual([followerOne, followerTwo]);
    expect(result.complete).toBe(true);
    expect(querySync).toHaveBeenCalledTimes(2);
    expect(querySync).toHaveBeenNthCalledWith(1, ['wss://owner.scope'], expect.objectContaining({
      '#p': [TARGET_PUBKEY],
    }));
    expect(querySync).toHaveBeenNthCalledWith(2, ['wss://owner.scope'], expect.objectContaining({
      authors: [followerOne, followerTwo],
    }));
  });

  it('returns partial followers instead of throwing when relay queries fail', async () => {
    const followerOne = 'e'.repeat(64);
    const querySync = vi
      .fn()
      .mockImplementationOnce(async () => [
        {
          id: '2'.repeat(64),
          pubkey: followerOne,
          created_at: 120,
          tags: [['p', TARGET_PUBKEY]],
          content: '',
        },
      ])
      .mockImplementationOnce(async () => {
        throw new Error('relay timeout');
      });
    const pool = { querySync } as unknown as SimplePool;

    const service = createGraphService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async () => ['wss://candidate.scope']),
      },
    });

    const result = await service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: `${followerOne}`,
      scopedReadRelays: ['wss://owner.scope'],
    });

    expect(result.pubkey).toBe(TARGET_PUBKEY);
    expect(result.followers).toEqual([followerOne]);
    expect(result.complete).toBe(false);
  });

  it('does not let slow candidate relay discovery exhaust owner-scope followers lookup timeout', async () => {
    vi.useFakeTimers();

    try {
      const followerOne = 'e'.repeat(64);
      const candidateAuthor = 'f'.repeat(64);
      const querySync = vi.fn(async () => [
        {
          id: '4'.repeat(64),
          pubkey: followerOne,
          created_at: 120,
          tags: [['p', TARGET_PUBKEY]],
          content: '',
        },
      ]);
      const getAuthorWriteRelays = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return ['wss://slow.candidate'];
      });
      const pool = { querySync } as unknown as SimplePool;

      const service = createGraphService({
        pool,
        bootstrapRelays: ['wss://bootstrap.one'],
        defaultTimeoutMs: 10,
        authorRelayDirectory: {
          getAuthorReadRelays: vi.fn(async () => []),
          getAuthorWriteRelays,
        },
      });

      const resultPromise = service.getFollowers({
        ownerPubkey: OWNER_PUBKEY,
        pubkey: TARGET_PUBKEY,
        candidateAuthors: candidateAuthor,
        scopedReadRelays: ['wss://owner.scope'],
      });

      await vi.advanceTimersByTimeAsync(20);

      await expect(resultPromise).resolves.toMatchObject({
        pubkey: TARGET_PUBKEY,
        followers: [followerOne],
      });
      expect(querySync).toHaveBeenCalledWith(['wss://owner.scope'], expect.objectContaining({
        '#p': [TARGET_PUBKEY],
      }));
      expect(getAuthorWriteRelays).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows default followers tag scans to exceed the short graph lookup timeout', async () => {
    vi.useFakeTimers();

    try {
      const followerOne = 'e'.repeat(64);
      const querySync = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 8_000));
        return [
          {
            id: '5'.repeat(64),
            pubkey: followerOne,
            created_at: 120,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      });
      const pool = { querySync } as unknown as SimplePool;

      const service = createGraphService({
        pool,
        bootstrapRelays: ['wss://bootstrap.one'],
        authorRelayDirectory: {
          getAuthorReadRelays: vi.fn(async () => []),
          getAuthorWriteRelays: vi.fn(async () => []),
        },
      });

      const resultPromise = service.getFollowers({
        ownerPubkey: OWNER_PUBKEY,
        pubkey: TARGET_PUBKEY,
        scopedReadRelays: ['wss://owner.scope'],
      });

      await vi.advanceTimersByTimeAsync(8_000);

      await expect(resultPromise).resolves.toMatchObject({
        pubkey: TARGET_PUBKEY,
        followers: [followerOne],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks followers incomplete when bootstrap owner-scope scan fails without scoped relays', async () => {
    const timeoutError = new Error('relay timeout');
    timeoutError.name = 'TimeoutError';
    const querySync = vi.fn(async () => {
      throw timeoutError;
    });
    const pool = { querySync } as unknown as SimplePool;

    const service = createGraphService({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async () => []),
      },
    });

    await expect(service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
    })).resolves.toEqual({
      pubkey: TARGET_PUBKEY,
      followers: [],
      complete: false,
    });
  });

  it('returns empty incomplete followers when gateway query fails', async () => {
    const followsGateway: RelayGateway<GraphFollowsQuery, GraphFollowsResponseDto> = {
      query: vi.fn(async () => ({
        pubkey: TARGET_PUBKEY,
        follows: [],
        relayHints: [],
      })),
      clearCache: vi.fn(),
    };
    const followersGateway: RelayGateway<GraphFollowersQuery, GraphFollowersResponseDto> = {
      query: vi.fn(async () => {
        throw new Error('gateway timeout');
      }),
      clearCache: vi.fn(),
    };

    const service = createGraphService({
      followsGateway,
      followersGateway,
    });

    const result = await service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: 'c'.repeat(64),
    });

    expect(result).toEqual({
      pubkey: TARGET_PUBKEY,
      followers: [],
      complete: false,
    });
  });

  it('returns an empty follows result when gateway query fails', async () => {
    const followsGateway: RelayGateway<GraphFollowsQuery, GraphFollowsResponseDto> = {
      query: vi.fn(async () => {
        throw new Error('gateway timeout');
      }),
      clearCache: vi.fn(),
    };
    const followersGateway: RelayGateway<GraphFollowersQuery, GraphFollowersResponseDto> = {
      query: vi.fn(async () => ({
        pubkey: TARGET_PUBKEY,
        followers: [],
        complete: false,
      })),
      clearCache: vi.fn(),
    };

    const service = createGraphService({
      followsGateway,
      followersGateway,
    });

    const result = await service.getFollows({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      scopedReadRelays: ['wss://relay.follows'],
    });

    expect(result).toEqual({
      pubkey: TARGET_PUBKEY,
      follows: [],
      relayHints: [],
    });
  });

  it('uses canonical relay-set cache keys for equivalent follower scopes', async () => {
    const followsGateway: RelayGateway<GraphFollowsQuery, GraphFollowsResponseDto> = {
      query: vi.fn(async () => ({
        pubkey: TARGET_PUBKEY,
        follows: [],
        relayHints: [],
      })),
      clearCache: vi.fn(),
    };
    const followersGateway: RelayGateway<GraphFollowersQuery, GraphFollowersResponseDto> = {
      query: vi.fn(async () => ({
        pubkey: TARGET_PUBKEY,
        followers: [],
        complete: true,
      })),
      clearCache: vi.fn(),
    };
    const service = createGraphService({
      followsGateway,
      followersGateway,
    });

    await service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: FOLLOW_ONE,
      scopedReadRelays: ['wss://relay.two', 'wss://relay.one', 'wss://relay.one'],
    });
    await service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: FOLLOW_ONE,
      scopedReadRelays: ['wss://relay.one', 'wss://relay.two'],
    });

    expect(followersGateway.query).toHaveBeenNthCalledWith(1, expect.objectContaining({
      key: `graph:followers:${TARGET_PUBKEY}:${FOLLOW_ONE}:wss://relay.one|wss://relay.two`,
    }));
    expect(followersGateway.query).toHaveBeenNthCalledWith(2, expect.objectContaining({
      key: `graph:followers:${TARGET_PUBKEY}:${FOLLOW_ONE}:wss://relay.one|wss://relay.two`,
    }));
  });
});
