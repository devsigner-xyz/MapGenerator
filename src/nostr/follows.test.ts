import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchFollowsByNpub, fetchFollowsByPubkey, parseFollowsFromKind3, __resetFollowsCacheForTests } from './follows';
import type { NostrClient, NostrEvent } from './types';

vi.mock('./npub', () => ({
    decodeNpubToHex: () => 'f'.repeat(64),
}));

describe('parseFollowsFromKind3', () => {
    test('extracts unique pubkeys from kind 3 p-tags', () => {
        const event: NostrEvent = {
            id: 'event-id',
            pubkey: 'f'.repeat(64),
            kind: 3,
            created_at: 1,
            content: '',
            tags: [
                ['p', 'a'.repeat(64)],
                ['p', 'b'.repeat(64), 'wss://relay.damus.io'],
                ['p', 'a'.repeat(64)],
                ['e', 'not-a-pubkey'],
            ],
        };

        expect(parseFollowsFromKind3(event)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    });

    test('returns empty list when event is not kind 3', () => {
        const event: NostrEvent = {
            id: 'event-id',
            pubkey: 'f'.repeat(64),
            kind: 1,
            created_at: 1,
            content: '',
            tags: [['p', 'a'.repeat(64)]],
        };

        expect(parseFollowsFromKind3(event)).toEqual([]);
    });
});

describe('fetchFollowsByNpub cache', () => {
    beforeEach(() => {
        __resetFollowsCacheForTests();
    });

    test('reuses cached follows result within ttl', async () => {
        const clientCalls = {
            connect: 0,
            fetchLatestReplaceableEvent: 0,
        };

        const client: NostrClient = {
            connect: async () => {
                clientCalls.connect += 1;
            },
            fetchLatestReplaceableEvent: async () => {
                clientCalls.fetchLatestReplaceableEvent += 1;
                return {
                    id: '1',
                    pubkey: 'f'.repeat(64),
                    kind: 3,
                    created_at: 1,
                    tags: [['p', 'a'.repeat(64)]],
                    content: '',
                };
            },
            fetchEvents: async () => [],
        };

        const npub = 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';
        const first = await fetchFollowsByNpub(npub, client);
        const second = await fetchFollowsByNpub(npub, client);

        expect(first).toEqual(second);
        expect(clientCalls.connect).toBe(1);
        expect(clientCalls.fetchLatestReplaceableEvent).toBe(1);
    });

    test('fetches follows by pubkey directly and reuses cache', async () => {
        const clientCalls = {
            connect: 0,
            fetchLatestReplaceableEvent: 0,
        };

        const client: NostrClient = {
            connect: async () => {
                clientCalls.connect += 1;
            },
            fetchLatestReplaceableEvent: async () => {
                clientCalls.fetchLatestReplaceableEvent += 1;
                return {
                    id: '1',
                    pubkey: 'f'.repeat(64),
                    kind: 3,
                    created_at: 1,
                    tags: [['p', 'a'.repeat(64)]],
                    content: '',
                };
            },
            fetchEvents: async () => [],
        };

        const pubkey = 'f'.repeat(64);
        const first = await fetchFollowsByPubkey(pubkey, client);
        const second = await fetchFollowsByPubkey(pubkey, client);

        expect(first).toEqual(second);
        expect(first.ownerPubkey).toBe(pubkey);
        expect(clientCalls.connect).toBe(1);
        expect(clientCalls.fetchLatestReplaceableEvent).toBe(1);
    });
});
