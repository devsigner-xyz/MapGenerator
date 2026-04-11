import { beforeEach, describe, expect, test } from 'vitest';
import { encodeHexToNpub } from './npub';
import { __resetUserSearchCacheForTests, searchUsers } from './user-search';
import type { NostrClient, NostrEvent, NostrFilter } from './types';

function createClientStub(eventsFactory: (filter: NostrFilter) => Promise<NostrEvent[]>): NostrClient {
    return {
        connect: async () => {},
        fetchLatestReplaceableEvent: async () => null,
        fetchEvents: eventsFactory,
    };
}

describe('searchUsers', () => {
    beforeEach(() => {
        __resetUserSearchCacheForTests();
    });

    test('returns exact npub match even without relay metadata', async () => {
        const targetPubkey = 'a'.repeat(64);
        const client = createClientStub(async () => []);

        const result = await searchUsers({
            query: encodeHexToNpub(targetPubkey),
            client,
        });

        expect(result.pubkeys).toEqual([targetPubkey]);
        expect(result.profiles[targetPubkey]).toEqual({ pubkey: targetPubkey });
    });

    test('merges exact and NIP-50 results without duplicates', async () => {
        const targetPubkey = 'b'.repeat(64);
        const otherPubkey = 'c'.repeat(64);
        const client = createClientStub(async () => [
            {
                id: '1',
                pubkey: targetPubkey,
                kind: 0,
                created_at: 10,
                tags: [],
                content: JSON.stringify({ display_name: 'Target New' }),
            },
            {
                id: '2',
                pubkey: targetPubkey,
                kind: 0,
                created_at: 8,
                tags: [],
                content: JSON.stringify({ display_name: 'Target Old' }),
            },
            {
                id: '3',
                pubkey: otherPubkey,
                kind: 0,
                created_at: 9,
                tags: [],
                content: JSON.stringify({ name: 'Other' }),
            },
        ]);

        const result = await searchUsers({
            query: targetPubkey,
            client,
            limit: 10,
        });

        expect(result.pubkeys).toEqual([targetPubkey, otherPubkey]);
        expect(result.profiles[targetPubkey].displayName).toBe('Target New');
        expect(result.profiles[otherPubkey].name).toBe('Other');
    });

    test('handles relay errors and keeps exact match fallback', async () => {
        const targetPubkey = 'd'.repeat(64);
        const client = createClientStub(async () => {
            throw new Error('relay failed');
        });

        const result = await searchUsers({
            query: encodeHexToNpub(targetPubkey),
            client,
        });

        expect(result.pubkeys).toEqual([targetPubkey]);
        expect(result.profiles[targetPubkey]).toEqual({ pubkey: targetPubkey });
    });
});
