import { describe, expect, test } from 'vitest';
import {
    buildFollowingFeedLastReadStorageKey,
    createFollowingFeedReadStateStorage,
    normalizeToEpochSeconds,
} from './following-feed-read-state';

function createStorage(initial: Record<string, string> = {}) {
    const data = new Map<string, string>(Object.entries(initial));

    return {
        data,
        storage: {
            getItem(key: string): string | null {
                return data.get(key) ?? null;
            },
            setItem(key: string, value: string): void {
                data.set(key, value);
            },
        },
    };
}

describe('following feed read-state storage', () => {
    test('parses malformed payloads safely', () => {
        const ownerPubkey = 'a'.repeat(64);
        const key = buildFollowingFeedLastReadStorageKey(ownerPubkey, 'v1');
        const { storage } = createStorage({
            [key]: '{not-json',
        });

        const readState = createFollowingFeedReadStateStorage({
            storage,
            version: 'v1',
        });

        expect(readState.getLastReadAt(ownerPubkey)).toBe(0);
    });

    test('builds versioned keys', () => {
        const ownerPubkey = 'b'.repeat(64);
        expect(buildFollowingFeedLastReadStorageKey(ownerPubkey, 'v1')).toBe(`nostr-overlay:following-feed:v1:last-read:${ownerPubkey}`);
    });

    test('normalizes milliseconds and stringified seconds', () => {
        const ownerPubkey = 'c'.repeat(64);
        const key = buildFollowingFeedLastReadStorageKey(ownerPubkey, 'v1');
        const { storage } = createStorage({
            [key]: JSON.stringify({ lastReadAt: '1700000000' }),
        });

        const readState = createFollowingFeedReadStateStorage({
            storage,
            version: 'v1',
        });

        expect(readState.getLastReadAt(ownerPubkey)).toBe(1_700_000_000);
        readState.setLastReadAt(ownerPubkey, 1_700_000_000_321);
        expect(storage.getItem(key)).toBe(JSON.stringify({ lastReadAt: 1_700_000_000 }));
        expect(normalizeToEpochSeconds(1_700_000_000_654)).toBe(1_700_000_000);
    });
});
