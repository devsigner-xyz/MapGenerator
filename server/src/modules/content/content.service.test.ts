// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createContentService } from './content.service';
import type { RelayGateway } from '../../relay/relay-gateway.types';
import type { ContentPostsQuery, ContentPostsResponseDto, ProfileStatsQuery, ProfileStatsResponseDto } from './content.schemas';

const OWNER_PUBKEY = 'a'.repeat(64);
const TARGET_PUBKEY = 'b'.repeat(64);

describe('content service', () => {
  it('returns stable posts page with limit+1 pagination', async () => {
    const querySync = vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
      if (Array.isArray(filter.kinds) && filter.kinds[0] === 1) {
        return [
          {
            id: '1'.repeat(64),
            pubkey: TARGET_PUBKEY,
            created_at: 30,
            tags: [],
            content: 'hello   world',
          },
          {
            id: '2'.repeat(64),
            pubkey: TARGET_PUBKEY,
            created_at: 20,
            tags: [],
            content: 'second',
          },
          {
            id: '3'.repeat(64),
            pubkey: TARGET_PUBKEY,
            created_at: 10,
            tags: [],
            content: 'third',
          },
        ];
      }

      return [];
    });
    const pool = { querySync } as unknown as SimplePool;

    const service = createContentService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getPosts({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      limit: 2,
      until: 999,
      scopedReadRelays: ['wss://owner.scope'],
    });

    expect(result.posts.map((post) => post.id)).toEqual(['1'.repeat(64), '2'.repeat(64)]);
    expect(result.posts[0]?.content).toBe('hello world');
    expect(result.hasMore).toBe(true);
    expect(result.nextUntil).toBe(19);
    expect(querySync).toHaveBeenCalledWith(['wss://owner.scope'], expect.objectContaining({
      authors: [TARGET_PUBKEY],
      kinds: [1],
    }));
  });

  it('falls back to bootstrap relays when scoped posts read returns no events', async () => {
    const querySync = vi.fn(async (relays: string[], filter: Record<string, unknown>) => {
      if (Array.isArray(filter.kinds) && filter.kinds[0] === 1) {
        if (relays[0] === 'wss://owner.scope') {
          return [];
        }

        return [
          {
            id: '4'.repeat(64),
            pubkey: TARGET_PUBKEY,
            created_at: 30,
            tags: [],
            content: 'fallback post',
          },
        ];
      }

      return [];
    });
    const pool = { querySync } as unknown as SimplePool;

    const service = createContentService({
      pool,
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async () => []),
      },
    });

    const result = await service.getPosts({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      limit: 2,
      scopedReadRelays: ['wss://owner.scope'],
    });

    expect(result.posts.map((post) => post.id)).toEqual(['4'.repeat(64)]);
    expect(querySync).toHaveBeenNthCalledWith(1, ['wss://owner.scope'], expect.any(Object));
    expect(querySync).toHaveBeenNthCalledWith(2, ['wss://bootstrap.one'], expect.any(Object));
  });

  it('returns an empty posts page when the posts gateway times out', async () => {
    const timeoutError = new Error('Relay query timed out after 7000ms');
    timeoutError.name = 'TimeoutError';
    const postsGateway: RelayGateway<ContentPostsQuery, ContentPostsResponseDto> = {
      query: vi.fn(async () => {
        throw timeoutError;
      }),
      clearCache: vi.fn(),
    };
    const profileStatsGateway: RelayGateway<ProfileStatsQuery, ProfileStatsResponseDto> = {
      query: vi.fn(async () => ({
        followsCount: 0,
        followersCount: 0,
      })),
      clearCache: vi.fn(),
    };

    const service = createContentService({
      postsGateway,
      profileStatsGateway,
    });

    await expect(service.getPosts({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      limit: 10,
      scopedReadRelays: ['wss://owner.scope'],
    })).resolves.toEqual({
      posts: [],
      nextUntil: null,
      hasMore: false,
    });
  });

  it('returns profile stats from follows + followers discovery', async () => {
    const follower = 'c'.repeat(64);
    const querySync = vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
      if (Array.isArray(filter.kinds) && filter.kinds[0] === 3 && Array.isArray(filter.authors)) {
        return [
          {
            id: '4'.repeat(64),
            pubkey: TARGET_PUBKEY,
            created_at: 100,
            tags: [['p', 'd'.repeat(64)], ['p', 'e'.repeat(64)]],
            content: '',
          },
        ];
      }

      if (Array.isArray(filter.kinds) && filter.kinds[0] === 3 && Array.isArray(filter['#p'])) {
        return [
          {
            id: '5'.repeat(64),
            pubkey: follower,
            created_at: 90,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      return [];
    });
    const pool = { querySync } as unknown as SimplePool;

    const service = createContentService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getProfileStats({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
    });

    expect(result).toEqual({
      followsCount: 2,
      followersCount: 1,
    });
  });

  it('returns zeroed stats when profile stats gateway query fails', async () => {
    const postsGateway: RelayGateway<ContentPostsQuery, ContentPostsResponseDto> = {
      query: vi.fn(async () => ({
        posts: [],
        nextUntil: null,
        hasMore: false,
      })),
      clearCache: vi.fn(),
    };
    const profileStatsGateway: RelayGateway<ProfileStatsQuery, ProfileStatsResponseDto> = {
      query: vi.fn(async () => {
        throw new Error('gateway timeout');
      }),
      clearCache: vi.fn(),
    };

    const service = createContentService({
      postsGateway,
      profileStatsGateway,
    });

    const result = await service.getProfileStats({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: 'c'.repeat(64),
    });

    expect(result).toEqual({
      followsCount: 0,
      followersCount: 0,
    });
  });

  it('uses canonical relay-set cache keys for equivalent post and stats scopes', async () => {
    const postsGateway: RelayGateway<ContentPostsQuery, ContentPostsResponseDto> = {
      query: vi.fn(async () => ({
        posts: [],
        nextUntil: null,
        hasMore: false,
      })),
      clearCache: vi.fn(),
    };
    const profileStatsGateway: RelayGateway<ProfileStatsQuery, ProfileStatsResponseDto> = {
      query: vi.fn(async () => ({
        followsCount: 1,
        followersCount: 2,
      })),
      clearCache: vi.fn(),
    };
    const service = createContentService({
      postsGateway,
      profileStatsGateway,
    });

    await service.getPosts({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      limit: 20,
      scopedReadRelays: ['wss://relay.two', 'wss://relay.one', 'wss://relay.one'],
    });
    await service.getProfileStats({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      scopedReadRelays: ['wss://relay.one', 'wss://relay.two'],
    });

    expect(postsGateway.query).toHaveBeenCalledWith(expect.objectContaining({
      key: `content:posts:${TARGET_PUBKEY}:20::wss://relay.one|wss://relay.two`,
    }));
    expect(profileStatsGateway.query).toHaveBeenCalledWith(expect.objectContaining({
      key: `content:profile-stats:${TARGET_PUBKEY}::wss://relay.one|wss://relay.two`,
    }));
  });
});
