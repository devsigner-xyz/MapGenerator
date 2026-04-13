type StorageVersion = 'v1';

export interface FollowingFeedReadStateStorage {
    getLastReadAt(ownerPubkey: string): number;
    setLastReadAt(ownerPubkey: string, timestampSec: number): void;
}

interface CreateFollowingFeedReadStateStorageOptions {
    storage: Pick<Storage, 'getItem' | 'setItem'>;
    version: StorageVersion;
}

function safeJsonParse<T>(value: string | null): T | null {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function toEpochSeconds(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    if (value > 1_000_000_000_000) {
        return Math.floor(value / 1000);
    }

    return Math.floor(value);
}

function parseTimestamp(value: unknown): number {
    if (typeof value === 'number') {
        return toEpochSeconds(value);
    }

    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
            return toEpochSeconds(parsed);
        }
    }

    return 0;
}

export function buildFollowingFeedLastReadStorageKey(ownerPubkey: string, version: StorageVersion = 'v1'): string {
    return `nostr-overlay:following-feed:${version}:last-read:${ownerPubkey}`;
}

export function createFollowingFeedReadStateStorage(
    options: CreateFollowingFeedReadStateStorageOptions
): FollowingFeedReadStateStorage {
    return {
        getLastReadAt(ownerPubkey) {
            const key = buildFollowingFeedLastReadStorageKey(ownerPubkey, options.version);
            const parsed = safeJsonParse<{ lastReadAt?: number | string }>(options.storage.getItem(key));
            if (!parsed || !('lastReadAt' in parsed)) {
                return 0;
            }

            return parseTimestamp(parsed.lastReadAt);
        },

        setLastReadAt(ownerPubkey, timestampSec) {
            const key = buildFollowingFeedLastReadStorageKey(ownerPubkey, options.version);
            options.storage.setItem(key, JSON.stringify({ lastReadAt: toEpochSeconds(timestampSec) }));
        },
    };
}

export const fallbackStorage: Pick<Storage, 'getItem' | 'setItem'> = {
    getItem() {
        return null;
    },
    setItem() {
        return;
    },
};

export function normalizeToEpochSeconds(value: number): number {
    return toEpochSeconds(value);
}
