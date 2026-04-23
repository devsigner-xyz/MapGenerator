// @vitest-environment node

import type { Filter } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { discoverFollowers } from './follower-discovery';

const TARGET_PUBKEY = 'a'.repeat(64);
const FOLLOWER_ONE = 'b'.repeat(64);
const FOLLOWER_TWO = 'c'.repeat(64);
const CANDIDATE_AUTHOR = 'd'.repeat(64);

describe('discoverFollowers', () => {
  it('uses owner scope for tag scan and candidate scopes for author enrichment', async () => {
    const queryEvents = vi.fn(async (relays: string[], filter: Filter) => {
      if (Array.isArray(filter['#p'])) {
        if (typeof filter.until === 'number') {
          return [];
        }

        return [
          {
            id: '1'.repeat(64),
            pubkey: FOLLOWER_ONE,
            created_at: 100,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      if (Array.isArray(filter.authors) && relays[0] === 'wss://candidate.scope') {
        return [
          {
            id: '2'.repeat(64),
            pubkey: FOLLOWER_TWO,
            created_at: 90,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      return [];
    });

    const result = await discoverFollowers({
      targetPubkey: TARGET_PUBKEY,
      ownerScope: {
        primary: ['wss://owner.scope'],
        fallback: ['wss://bootstrap.one'],
      },
      candidateAuthorScopes: [
        {
          authors: [CANDIDATE_AUTHOR],
          relays: ['wss://candidate.scope'],
          fallbackRelays: ['wss://bootstrap.one'],
        },
      ],
      queryEvents,
    });

    expect(result.followers).toEqual([FOLLOWER_ONE, FOLLOWER_TWO]);
    expect(result.ownerScopeComplete).toBe(true);
    expect(result.candidateScopesComplete).toBe(true);
    expect(queryEvents).toHaveBeenCalledWith(
      ['wss://owner.scope'],
      expect.objectContaining({
        '#p': [TARGET_PUBKEY],
      }),
    );
    expect(queryEvents).toHaveBeenCalledWith(
      ['wss://candidate.scope'],
      expect.objectContaining({
        authors: [CANDIDATE_AUTHOR],
      }),
    );
  });

  it('returns partial diagnostics when candidate enrichment fails', async () => {
    const queryEvents = vi.fn(async (_relays: string[], filter: Filter) => {
      if (Array.isArray(filter['#p'])) {
        if (typeof filter.until === 'number') {
          return [];
        }

        return [
          {
            id: '3'.repeat(64),
            pubkey: FOLLOWER_ONE,
            created_at: 100,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      throw new Error('candidate relay timeout');
    });

    const result = await discoverFollowers({
      targetPubkey: TARGET_PUBKEY,
      ownerScope: {
        primary: ['wss://owner.scope'],
        fallback: ['wss://bootstrap.one'],
      },
      candidateAuthorScopes: [
        {
          authors: [CANDIDATE_AUTHOR],
          relays: ['wss://candidate.scope'],
          fallbackRelays: ['wss://bootstrap.one'],
        },
      ],
      queryEvents,
    });

    expect(result.followers).toEqual([FOLLOWER_ONE]);
    expect(result.ownerScopeComplete).toBe(true);
    expect(result.candidateScopesComplete).toBe(false);
  });

  it('retries candidate enrichment on owner fallback relays when scoped relays fail', async () => {
    const queryEvents = vi.fn(async (relays: string[], filter: Filter) => {
      if (Array.isArray(filter['#p'])) {
        if (typeof filter.until === 'number') {
          return [];
        }

        return [
          {
            id: '4'.repeat(64),
            pubkey: FOLLOWER_ONE,
            created_at: 100,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      if (Array.isArray(filter.authors) && relays[0] === 'wss://bootstrap.one') {
        return [
          {
            id: '5'.repeat(64),
            pubkey: FOLLOWER_TWO,
            created_at: 90,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      throw new Error('candidate relay timeout');
    });

    const result = await discoverFollowers({
      targetPubkey: TARGET_PUBKEY,
      ownerScope: {
        primary: ['wss://owner.scope'],
        fallback: ['wss://bootstrap.one'],
      },
      candidateAuthorScopes: [
        {
          authors: [CANDIDATE_AUTHOR],
          relays: ['wss://candidate.scope'],
          fallbackRelays: ['wss://bootstrap.one'],
        },
      ],
      queryEvents,
    });

    expect(result.followers).toEqual([FOLLOWER_ONE, FOLLOWER_TWO]);
    expect(result.ownerScopeComplete).toBe(true);
    expect(result.candidateScopesComplete).toBe(true);
  });

  it('retries candidate enrichment on owner primary relays when bootstrap is already the primary scope', async () => {
    const queryEvents = vi.fn(async (relays: string[], filter: Record<string, unknown>) => {
      if (Array.isArray(filter['#p'])) {
        if (typeof filter.until === 'number') {
          return [];
        }

        return [
          {
            id: '6'.repeat(64),
            pubkey: FOLLOWER_ONE,
            created_at: 100,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      if (Array.isArray(filter.authors) && relays[0] === 'wss://bootstrap.one') {
        return [
          {
            id: '7'.repeat(64),
            pubkey: FOLLOWER_TWO,
            created_at: 90,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      throw new Error('candidate relay timeout');
    });

    const result = await discoverFollowers({
      targetPubkey: TARGET_PUBKEY,
      ownerScope: {
        primary: ['wss://bootstrap.one'],
        fallback: [],
      },
      candidateAuthorScopes: [
        {
          authors: [CANDIDATE_AUTHOR],
          relays: ['wss://candidate.scope'],
          fallbackRelays: ['wss://bootstrap.one'],
        },
      ],
      queryEvents,
    });

    expect(result.followers).toEqual([FOLLOWER_ONE, FOLLOWER_TWO]);
    expect(result.ownerScopeComplete).toBe(true);
    expect(result.candidateScopesComplete).toBe(true);
  });

  it('falls back to owner bootstrap scope when primary tag scan returns no events', async () => {
    const queryEvents = vi.fn(async (relays: string[], filter: Filter) => {
      if (Array.isArray(filter['#p']) && relays[0] === 'wss://owner.scope') {
        return [];
      }

      if (Array.isArray(filter['#p']) && relays[0] === 'wss://bootstrap.one') {
        return [
          {
            id: '8'.repeat(64),
            pubkey: FOLLOWER_ONE,
            created_at: 100,
            tags: [['p', TARGET_PUBKEY]],
            content: '',
          },
        ];
      }

      return [];
    });

    const result = await discoverFollowers({
      targetPubkey: TARGET_PUBKEY,
      ownerScope: {
        primary: ['wss://owner.scope'],
        fallback: ['wss://bootstrap.one'],
      },
      candidateAuthorScopes: [],
      queryEvents,
    });

    expect(result.followers).toEqual([FOLLOWER_ONE]);
    expect(result.ownerScopeComplete).toBe(true);
    expect(result.candidateScopesComplete).toBe(true);
  });
});
