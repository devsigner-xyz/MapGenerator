import { describe, expect, test } from 'vitest';
import { parseFollowsFromKind3 } from './follows';
import type { NostrEvent } from './types';

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
