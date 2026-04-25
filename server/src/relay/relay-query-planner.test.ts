// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createRelayQueryPlanner } from './relay-query-planner';

const TARGET_PUBKEY = 'a'.repeat(64);
const AUTHOR_ONE = 'b'.repeat(64);
const AUTHOR_TWO = 'c'.repeat(64);
const AUTHOR_THREE = 'd'.repeat(64);

describe('createRelayQueryPlanner', () => {
  it('uses scoped read relays as canonical primary for posts and bootstrap as fallback', async () => {
    const planner = createRelayQueryPlanner({
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async () => []),
      },
    });

    await expect(planner.planPosts({
      scopedReadRelays: ['wss://relay.two', 'wss://relay.one', 'wss://relay.one'],
      targetPubkey: TARGET_PUBKEY,
    })).resolves.toEqual({
      primary: ['wss://relay.one', 'wss://relay.two'],
      fallback: ['wss://bootstrap.one'],
    });
  });

  it('enriches post-like reads with target author relays when available', async () => {
    const planner = createRelayQueryPlanner({
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => ['wss://author.read']),
        getAuthorWriteRelays: vi.fn(async () => []),
      },
    });

    await expect(planner.planPosts({
      scopedReadRelays: ['wss://relay.two'],
      targetPubkey: TARGET_PUBKEY,
    })).resolves.toEqual({
      primary: ['wss://author.read', 'wss://relay.two'],
      fallback: ['wss://bootstrap.one'],
    });
  });

  it('keeps bootstrap relays as fallback only when post reads have no primary relays', async () => {
    const planner = createRelayQueryPlanner({
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async () => []),
      },
    });

    await expect(planner.planPosts({
      targetPubkey: TARGET_PUBKEY,
    })).resolves.toEqual({
      primary: [],
      fallback: ['wss://bootstrap.one'],
    });
  });

  it('groups candidate authors by canonical relay set and caps fan-out relays', async () => {
    const getAuthorWriteRelays = vi.fn(async (pubkey: string) => {
      if (pubkey === AUTHOR_ONE || pubkey === AUTHOR_TWO) {
        return ['wss://shared.two', 'wss://shared.one'];
      }

      return ['wss://overflow.four', 'wss://overflow.three', 'wss://overflow.two', 'wss://overflow.one'];
    });
    const planner = createRelayQueryPlanner({
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays,
      },
    });

    const result = await planner.planFollowers({
      scopedReadRelays: ['wss://owner.scope'],
      targetPubkey: TARGET_PUBKEY,
      candidateAuthors: [AUTHOR_ONE, AUTHOR_TWO, AUTHOR_THREE],
    });

    expect(result.ownerScope).toEqual({
      primary: ['wss://owner.scope'],
      fallback: ['wss://bootstrap.one'],
    });
    expect(result.candidateAuthorScopes).toEqual([
      {
        authors: [AUTHOR_ONE, AUTHOR_TWO],
        relays: ['wss://shared.one', 'wss://shared.two'],
        fallbackRelays: ['wss://bootstrap.one'],
      },
      {
        authors: [AUTHOR_THREE],
        relays: ['wss://overflow.four', 'wss://overflow.one', 'wss://overflow.three'],
        fallbackRelays: ['wss://bootstrap.one'],
      },
    ]);
    expect(getAuthorWriteRelays).toHaveBeenCalledTimes(3);
  });

  it('falls back to bootstrap relays when author relay discovery is missing or fails', async () => {
    const planner = createRelayQueryPlanner({
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async (pubkey: string) => {
          if (pubkey === AUTHOR_ONE) {
            return [];
          }

          throw new Error('lookup failed');
        }),
      },
    });

    const result = await planner.planFollowers({
      scopedReadRelays: ['wss://owner.scope'],
      targetPubkey: TARGET_PUBKEY,
      candidateAuthors: [AUTHOR_ONE, AUTHOR_TWO],
    });

    expect(result.candidateAuthorScopes).toEqual([
      {
        authors: [AUTHOR_ONE, AUTHOR_TWO],
        relays: ['wss://bootstrap.one'],
        fallbackRelays: ['wss://bootstrap.one'],
      },
    ]);
  });

  it('limits concurrent author relay discovery to avoid flooding bootstrap relays', async () => {
    let activeLookups = 0;
    let maxConcurrentLookups = 0;

    const planner = createRelayQueryPlanner({
      bootstrapRelays: ['wss://bootstrap.one'],
      authorRelayDirectory: {
        getAuthorReadRelays: vi.fn(async () => []),
        getAuthorWriteRelays: vi.fn(async (pubkey: string) => {
          activeLookups += 1;
          maxConcurrentLookups = Math.max(maxConcurrentLookups, activeLookups);
          await new Promise((resolve) => setTimeout(resolve, 0));
          activeLookups -= 1;
          return [`wss://relay.${pubkey.slice(0, 4)}.example`];
        }),
      },
    });

    await planner.planFollowers({
      scopedReadRelays: ['wss://owner.scope'],
      targetPubkey: TARGET_PUBKEY,
      candidateAuthors: [AUTHOR_ONE, AUTHOR_TWO, AUTHOR_THREE, 'e'.repeat(64), 'f'.repeat(64), '1'.repeat(64), '2'.repeat(64), '3'.repeat(64)],
    });

    expect(maxConcurrentLookups).toBeLessThanOrEqual(4);
  });
});
