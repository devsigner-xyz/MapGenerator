import { describe, expect, test } from 'vitest';
import type { NostrEvent } from './types';
import {
    extractTargetEventId,
    isMainFeedEvent,
    isReplyEvent,
    toSocialFeedItem,
} from './social-feed-service';

function event(input: {
    id: string;
    pubkey?: string;
    kind: number;
    createdAt?: number;
    tags?: string[][];
    content?: string;
}): NostrEvent {
    return {
        id: input.id,
        pubkey: input.pubkey ?? 'a'.repeat(64),
        kind: input.kind,
        created_at: input.createdAt ?? 100,
        tags: input.tags ?? [],
        content: input.content ?? '',
    };
}

describe('social-feed-service domain helpers', () => {
    test('includes standalone notes in main feed', () => {
        const note = event({
            id: 'note-1',
            kind: 1,
            content: 'hola mundo',
        });

        expect(isReplyEvent(note)).toBe(false);
        expect(isMainFeedEvent(note)).toBe(true);
        expect(toSocialFeedItem(note)).toMatchObject({
            kind: 'note',
            id: 'note-1',
        });
    });

    test('excludes replies from main feed and keeps them for thread view', () => {
        const reply = event({
            id: 'reply-1',
            kind: 1,
            tags: [
                ['e', 'root-event', '', 'root'],
                ['e', 'parent-event', '', 'reply'],
            ],
            content: 'respuesta',
        });

        expect(isReplyEvent(reply)).toBe(true);
        expect(isMainFeedEvent(reply)).toBe(false);
        expect(extractTargetEventId(reply)).toBe('parent-event');
        expect(toSocialFeedItem(reply)).toBeNull();
    });

    test('keeps single-reference notes in main feed', () => {
        const noteWithReference = event({
            id: 'note-ref-1',
            kind: 1,
            tags: [['e', 'quoted-event']],
            content: 'mira este evento',
        });

        expect(isReplyEvent(noteWithReference)).toBe(false);
        expect(isMainFeedEvent(noteWithReference)).toBe(true);
        expect(toSocialFeedItem(noteWithReference)).toMatchObject({
            id: 'note-ref-1',
            kind: 'note',
        });
    });

    test('includes reposts in main feed', () => {
        const repost = event({
            id: 'repost-1',
            kind: 6,
            tags: [
                ['e', 'target-note'],
                ['p', 'b'.repeat(64)],
            ],
        });

        expect(isReplyEvent(repost)).toBe(false);
        expect(isMainFeedEvent(repost)).toBe(true);
        expect(extractTargetEventId(repost)).toBe('target-note');
        expect(toSocialFeedItem(repost)).toMatchObject({
            kind: 'repost',
            targetEventId: 'target-note',
        });
    });

    test('ignores non timeline events', () => {
        const reaction = event({
            id: 'reaction-1',
            kind: 7,
            tags: [['e', 'target-note']],
            content: '+',
        });

        expect(isMainFeedEvent(reaction)).toBe(false);
        expect(toSocialFeedItem(reaction)).toBeNull();
    });
});
