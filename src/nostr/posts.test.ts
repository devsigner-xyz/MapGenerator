import { describe, expect, test } from 'vitest';
import { fetchLatestPostsByPubkey } from './posts';
import type { NostrClient, NostrEvent, NostrFilter } from './types';

function noteEvent(input: { id: string; pubkey: string; createdAt: number; content: string }): NostrEvent {
    return {
        id: input.id,
        pubkey: input.pubkey,
        kind: 1,
        created_at: input.createdAt,
        tags: [],
        content: input.content,
    };
}

describe('fetchLatestPostsByPubkey', () => {
    test('returns posts ordered by created_at and enforces limit', async () => {
        const targetPubkey = 'f'.repeat(64);
        const requestedFilters: NostrFilter[] = [];
        const client: NostrClient = {
            connect: async () => undefined,
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async (filter) => {
                requestedFilters.push(filter);
                return [
                    noteEvent({ id: 'older', pubkey: targetPubkey, createdAt: 120, content: 'old post' }),
                    noteEvent({ id: 'newest', pubkey: targetPubkey, createdAt: 220, content: ' newest\npost ' }),
                    noteEvent({ id: 'middle', pubkey: targetPubkey, createdAt: 180, content: 'middle' }),
                ];
            },
        };

        const result = await fetchLatestPostsByPubkey({
            pubkey: targetPubkey,
            client,
            limit: 2,
        });

        expect(requestedFilters[0]).toMatchObject({
            authors: [targetPubkey],
            kinds: [1],
            limit: 2,
        });
        expect(result.posts.map((post) => post.id)).toEqual(['newest', 'middle']);
        expect(result.posts[0]?.content).toBe('newest post');
        expect(result.hasMore).toBe(true);
        expect(result.nextUntil).toBe(179);
    });

    test('supports pagination by until cursor', async () => {
        const targetPubkey = 'e'.repeat(64);
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
                        noteEvent({ id: 'p1', pubkey: targetPubkey, createdAt: 300, content: 'first page A' }),
                        noteEvent({ id: 'p2', pubkey: targetPubkey, createdAt: 250, content: 'first page B' }),
                    ];
                }

                return [noteEvent({ id: 'p3', pubkey: targetPubkey, createdAt: 200, content: 'second page' })];
            },
        };

        const firstPage = await fetchLatestPostsByPubkey({ pubkey: targetPubkey, client, limit: 2 });
        const firstPageUntil = firstPage.nextUntil;
        expect(firstPageUntil).toBeDefined();
        if (firstPageUntil === undefined) {
            throw new Error('first page cursor is missing');
        }

        const secondPage = await fetchLatestPostsByPubkey({
            pubkey: targetPubkey,
            client,
            limit: 2,
            until: firstPageUntil,
        });

        expect(firstPage.posts.map((post) => post.id)).toEqual(['p1', 'p2']);
        expect(firstPage.nextUntil).toBe(249);
        expect(secondPage.posts.map((post) => post.id)).toEqual(['p3']);
        expect(secondPage.hasMore).toBe(false);
        expect(requestedFilters[1]).toMatchObject({ until: 249, limit: 2 });
    });
});
