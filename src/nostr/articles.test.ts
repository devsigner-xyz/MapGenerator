import { describe, expect, test } from 'vitest';
import type { NostrEvent } from './types';
import { LONG_FORM_ARTICLE_KIND, isLongFormArticleEvent, parseArticleMetadata } from './articles';

function event(input: Partial<NostrEvent> = {}): NostrEvent {
    return {
        id: input.id ?? 'a'.repeat(64),
        pubkey: input.pubkey ?? 'b'.repeat(64),
        kind: input.kind ?? LONG_FORM_ARTICLE_KIND,
        created_at: input.created_at ?? 100,
        tags: input.tags ?? [],
        content: input.content ?? 'Article **body**',
    };
}

describe('articles', () => {
    test('identifies NIP-23 long-form articles', () => {
        expect(isLongFormArticleEvent(event())).toBe(true);
        expect(isLongFormArticleEvent(event({ kind: 1 }))).toBe(false);
    });

    test('parses article metadata tags', () => {
        const metadata = parseArticleMetadata(event({
            tags: [
                ['title', 'My article'],
                ['summary', 'Short summary'],
                ['image', 'https://example.com/cover.jpg'],
                ['published_at', '1710000000'],
                ['t', 'nostr'],
                ['t', 'maps'],
            ],
        }));

        expect(metadata).toMatchObject({
            title: 'My article',
            summary: 'Short summary',
            image: 'https://example.com/cover.jpg',
            publishedAt: 1710000000,
            topics: ['nostr', 'maps'],
        });
    });

    test('falls back to undefined metadata when tags are missing or invalid', () => {
        const metadata = parseArticleMetadata(event({
            tags: [['published_at', 'not-a-number'], ['t', '']],
        }));

        expect(metadata.title).toBeUndefined();
        expect(metadata.summary).toBeUndefined();
        expect(metadata.image).toBeUndefined();
        expect(metadata.publishedAt).toBeUndefined();
        expect(metadata.topics).toEqual([]);
    });
});
