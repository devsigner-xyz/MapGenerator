import { describe, expect, test } from 'vitest';
import { relayListFromKind10002Event, relaySuggestionsByTypeFromKind10002Event } from './relay-policy';
import type { NostrEvent } from './types';

describe('relayListFromKind10002Event', () => {
    test('extracts and normalizes relay urls from kind 10002 tags', () => {
        const event: NostrEvent = {
            id: 'evt',
            pubkey: 'f'.repeat(64),
            kind: 10002,
            created_at: 100,
            tags: [
                ['r', 'wss://relay.one/'],
                ['r', 'wss://relay.two', 'read'],
                ['r', 'wss://relay.one'],
                ['p', 'a'.repeat(64)],
            ],
            content: '',
        };

        expect(relayListFromKind10002Event(event)).toEqual(['wss://relay.one', 'wss://relay.two']);
    });

    test('returns empty list for non relay-list events', () => {
        const event: NostrEvent = {
            id: 'evt2',
            pubkey: 'f'.repeat(64),
            kind: 1,
            created_at: 100,
            tags: [['r', 'wss://relay.one']],
            content: '',
        };

        expect(relayListFromKind10002Event(event)).toEqual([]);
        expect(relayListFromKind10002Event(null)).toEqual([]);
    });

    test('classifies suggested relays by read/write marker', () => {
        const event: NostrEvent = {
            id: 'evt3',
            pubkey: 'f'.repeat(64),
            kind: 10002,
            created_at: 100,
            tags: [
                ['r', 'wss://relay.read.example', 'read'],
                ['r', 'wss://relay.write.example', 'write'],
                ['r', 'wss://relay.both.example'],
            ],
            content: '',
        };

        expect(relaySuggestionsByTypeFromKind10002Event(event)).toEqual({
            general: ['wss://relay.read.example', 'wss://relay.write.example', 'wss://relay.both.example'],
            dmInbox: ['wss://relay.read.example', 'wss://relay.both.example'],
            dmOutbox: ['wss://relay.write.example', 'wss://relay.both.example'],
        });
    });
});
