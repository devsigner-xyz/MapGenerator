// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { SimplePool } from 'nostr-tools';

import { createSocialService } from './social.service';

const OWNER = 'a'.repeat(64);
const ROOT_EVENT_ID = 'b'.repeat(64);
const FOLLOW = 'c'.repeat(64);

describe('social service pagination', () => {
  it('computes feed hasMore and nextUntil using limit+1 strategy', async () => {
    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (Array.isArray(filter.kinds) && filter.kinds[0] === 3) {
          return [
            {
              id: '1'.repeat(64),
              pubkey: OWNER,
              kind: 3,
              created_at: 100,
              tags: [['p', FOLLOW]],
              content: '',
            },
          ];
        }

        return [
          {
            id: '2'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 30,
            tags: [],
            content: 'n1',
          },
          {
            id: '3'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 20,
            tags: [],
            content: 'n2',
          },
          {
            id: '4'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 10,
            tags: [],
            content: 'n3',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getFollowingFeed({
      ownerPubkey: OWNER,
      limit: 2,
      until: 999,
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextUntil).toBe(19);
  });

  it('computes thread hasMore and nextUntil using limit+1 strategy', async () => {
    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (Array.isArray(filter.ids)) {
          return [
            {
              id: ROOT_EVENT_ID,
              pubkey: OWNER,
              kind: 1,
              created_at: 90,
              tags: [],
              content: 'root',
            },
          ];
        }

        return [
          {
            id: '5'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 40,
            tags: [['e', ROOT_EVENT_ID]],
            content: 'r1',
          },
          {
            id: '6'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 30,
            tags: [['e', ROOT_EVENT_ID]],
            content: 'r2',
          },
          {
            id: '7'.repeat(64),
            pubkey: FOLLOW,
            kind: 1,
            created_at: 20,
            tags: [['e', ROOT_EVENT_ID]],
            content: 'r3',
          },
        ];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getThread({
      rootEventId: ROOT_EVENT_ID,
      limit: 2,
      until: 999,
    });

    expect(result.root?.id).toBe(ROOT_EVENT_ID);
    expect(result.replies).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextUntil).toBe(29);
  });

  it('aggregates engagement counters by event id', async () => {
    const eventA = 'd'.repeat(64);
    const eventB = 'e'.repeat(64);

    const pool = {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        if (!Array.isArray(filter.kinds)) {
          return [];
        }

        const kind = filter.kinds[0];
        if (kind === 1) {
          return [
            {
              id: '8'.repeat(64),
              pubkey: FOLLOW,
              kind: 1,
              created_at: 10,
              tags: [['e', eventA]],
              content: 'reply',
            },
          ];
        }

        if (kind === 6) {
          return [
            {
              id: '9'.repeat(64),
              pubkey: FOLLOW,
              kind: 6,
              created_at: 10,
              tags: [['e', eventA]],
              content: '',
            },
          ];
        }

        if (kind === 7) {
          return [
            {
              id: 'f'.repeat(64),
              pubkey: FOLLOW,
              kind: 7,
              created_at: 10,
              tags: [
                ['e', eventA, '', 'root'],
                ['e', eventB, '', 'reply'],
              ],
              content: '+',
            },
          ];
        }

        if (kind === 9735) {
          return [
            {
              id: '1'.repeat(64),
              pubkey: FOLLOW,
              kind: 9735,
              created_at: 10,
              tags: [
                ['e', eventA],
                ['amount', '21000'],
              ],
              content: '',
            },
            {
              id: '2'.repeat(64),
              pubkey: FOLLOW,
              kind: 9735,
              created_at: 11,
              tags: [
                ['e', eventB],
                ['amount', '3000'],
              ],
              content: '',
            },
          ];
        }

        return [];
      }),
    } as unknown as SimplePool;

    const service = createSocialService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getEngagement({
      eventIds: [eventA, eventB],
      until: 999,
    });

    expect(result.byEventId[eventA]).toEqual({
      replies: 1,
      reposts: 1,
      reactions: 0,
      zaps: 1,
      zapSats: 21,
    });
    expect(result.byEventId[eventB]).toEqual({
      replies: 0,
      reposts: 0,
      reactions: 1,
      zaps: 1,
      zapSats: 3,
    });
  });
});
