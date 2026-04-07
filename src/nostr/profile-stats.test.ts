import { beforeEach, describe, expect, test } from 'vitest';
import { __resetFollowersCacheForTests } from './followers';
import { fetchProfileStats } from './profile-stats';
import type { NostrClient, NostrEvent } from './types';

function kind3Event(input: { pubkey: string; createdAt: number; follows: string[] }): NostrEvent {
    return {
        id: `${input.pubkey}-${input.createdAt}`,
        pubkey: input.pubkey,
        kind: 3,
        created_at: input.createdAt,
        tags: input.follows.map((pubkey) => ['p', pubkey]),
        content: '',
    };
}

describe('fetchProfileStats', () => {
    beforeEach(() => {
        __resetFollowersCacheForTests();
    });

    test('returns follows and followers counts for a profile', async () => {
        const targetPubkey = 'a'.repeat(64);
        const followsA = 'b'.repeat(64);
        const followsB = 'c'.repeat(64);
        const followerA = 'd'.repeat(64);
        const followerB = 'e'.repeat(64);

        const client: NostrClient = {
            connect: async () => undefined,
            fetchLatestReplaceableEvent: async () => kind3Event({
                pubkey: targetPubkey,
                createdAt: 100,
                follows: [followsA, followsB, followsA],
            }),
            fetchEvents: async () => [
                kind3Event({ pubkey: followerA, createdAt: 90, follows: [targetPubkey] }),
                kind3Event({ pubkey: followerB, createdAt: 89, follows: [targetPubkey] }),
            ],
        };

        const result = await fetchProfileStats({
            pubkey: targetPubkey,
            client,
            candidateAuthors: [followerA, followerB],
        });

        expect(result).toEqual({
            followsCount: 2,
            followersCount: 2,
        });
    });

    test('returns zero counts when profile graph is missing', async () => {
        const targetPubkey = 'f'.repeat(64);
        const client: NostrClient = {
            connect: async () => undefined,
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async () => [],
        };

        const result = await fetchProfileStats({
            pubkey: targetPubkey,
            client,
        });

        expect(result).toEqual({
            followsCount: 0,
            followersCount: 0,
        });
    });
});
