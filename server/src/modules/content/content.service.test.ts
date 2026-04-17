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
    });

    expect(result.posts.map((post) => post.id)).toEqual(['1'.repeat(64), '2'.repeat(64)]);
    expect(result.posts[0]?.content).toBe('hello world');
    expect(result.hasMore).toBe(true);
    expect(result.nextUntil).toBe(19);
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
});
