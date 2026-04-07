import { beforeEach, describe, expect, test } from 'vitest';
import { __resetFollowersCacheForTests, fetchFollowersBestEffort } from './followers';
import type { NostrClient, NostrEvent, NostrFilter } from './types';

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

describe('fetchFollowersBestEffort', () => {
    beforeEach(() => {
        __resetFollowersCacheForTests();
    });

    test('loads followers in batches with deduplication', async () => {
        const targetPubkey = 'a'.repeat(64);
        const firstFollower = 'b'.repeat(64);
        const secondFollower = 'c'.repeat(64);
        const thirdFollower = 'd'.repeat(64);

        const requestedFilters: NostrFilter[] = [];
        let call = 0;
        const client: NostrClient = {
            connect: async () => undefined,
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async (filter) => {
                requestedFilters.push(filter);
                call += 1;

                if (call === 1) {
                    return [
                        kind3Event({ pubkey: firstFollower, createdAt: 350, follows: [targetPubkey] }),
                        kind3Event({ pubkey: secondFollower, createdAt: 320, follows: [targetPubkey] }),
                    ];
                }

                if (call === 2) {
                    return [
                        kind3Event({ pubkey: secondFollower, createdAt: 300, follows: [targetPubkey] }),
                        kind3Event({ pubkey: thirdFollower, createdAt: 280, follows: [targetPubkey] }),
                    ];
                }

                return [];
            },
        };

        const result = await fetchFollowersBestEffort({
            targetPubkey,
            client,
            maxBatches: 3,
            batchLimit: 2,
        });

        expect(result.followers).toEqual([firstFollower, secondFollower, thirdFollower]);
        expect(result.complete).toBe(true);
        expect(result.scannedBatches).toBe(2);

        expect(requestedFilters[0]).toMatchObject({
            kinds: [3],
            '#p': [targetPubkey],
            limit: 2,
        });
        expect(requestedFilters[1]?.until).toBe(319);
    });

    test('falls back to candidate authors when #p index returns no events', async () => {
        const targetPubkey = '9'.repeat(64);
        const candidateFollower = '7'.repeat(64);
        const candidateNonFollower = '6'.repeat(64);

        const requestedFilters: NostrFilter[] = [];
        let fetchCall = 0;
        const client: NostrClient = {
            connect: async () => undefined,
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async (filter) => {
                requestedFilters.push(filter);
                fetchCall += 1;

                if (fetchCall === 1) {
                    return [];
                }

                return [
                    kind3Event({ pubkey: candidateFollower, createdAt: 120, follows: [targetPubkey] }),
                    kind3Event({ pubkey: candidateNonFollower, createdAt: 119, follows: ['3'.repeat(64)] }),
                ];
            },
        };

        const result = await fetchFollowersBestEffort({
            targetPubkey,
            client,
            maxBatches: 1,
            batchLimit: 2,
            candidateAuthors: [candidateFollower, candidateNonFollower],
            candidateAuthorBatchSize: 2,
        });

        expect(result.followers).toEqual([candidateFollower]);
        expect(result.complete).toBe(true);
        expect(requestedFilters[0]).toMatchObject({
            kinds: [3],
            '#p': [targetPubkey],
        });
        expect(requestedFilters[1]).toMatchObject({
            kinds: [3],
            authors: [candidateFollower, candidateNonFollower],
        });
    });

    test('reuses cached follower discovery for identical input', async () => {
        const targetPubkey = '9'.repeat(64);
        const candidateFollower = '7'.repeat(64);
        const requestedFilters: NostrFilter[] = [];

        const client: NostrClient = {
            connect: async () => undefined,
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async (filter) => {
                requestedFilters.push(filter);
                return [
                    kind3Event({ pubkey: candidateFollower, createdAt: 120, follows: [targetPubkey] }),
                ];
            },
        };

        const first = await fetchFollowersBestEffort({
            targetPubkey,
            client,
            maxBatches: 1,
            batchLimit: 2,
            candidateAuthors: [candidateFollower],
            candidateAuthorBatchSize: 1,
        });

        const second = await fetchFollowersBestEffort({
            targetPubkey,
            client,
            maxBatches: 1,
            batchLimit: 2,
            candidateAuthors: [candidateFollower],
            candidateAuthorBatchSize: 1,
        });

        expect(first).toEqual(second);
        expect(requestedFilters.length).toBe(2);
    });
});
