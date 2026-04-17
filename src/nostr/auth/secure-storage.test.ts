import { describe, expect, test } from 'vitest';
import {
    AUTH_SESSION_STORAGE_KEY,
    clearStoredAuthSession,
    loadStoredAuthSession,
    saveStoredAuthSession,
    type StoredAuthSession,
} from './secure-storage';

const SAMPLE_PUBKEY = 'f'.repeat(64);

function createMemoryStorage(): Storage {
    const values = new Map<string, string>();

    return {
        get length() {
            return values.size;
        },
        clear() {
            values.clear();
        },
        getItem(key) {
            return values.has(key) ? values.get(key)! : null;
        },
        key(index) {
            return Array.from(values.keys())[index] ?? null;
        },
        removeItem(key) {
            values.delete(key);
        },
        setItem(key, value) {
            values.set(key, value);
        },
    };
}

function buildSession(overrides: Partial<StoredAuthSession> = {}): StoredAuthSession {
    return {
        method: 'nip46',
        pubkey: SAMPLE_PUBKEY,
        readonly: false,
        locked: false,
        createdAt: 123,
        ...overrides,
    };
}

describe('secure-storage', () => {
    test('saves and loads stored session payload', () => {
        const storage = createMemoryStorage();
        const session = buildSession();

        saveStoredAuthSession(session, storage);
        const loaded = loadStoredAuthSession(storage);

        expect(loaded).toEqual(session);
    });

    test('does not persist legacy ncryptsec payload field', () => {
        const storage = createMemoryStorage();
        const session = buildSession();

        saveStoredAuthSession(session, storage);
        const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY) ?? '';

        expect(raw).not.toContain('ncryptsec');
    });

    test('loads legacy payloads but strips ncryptsec field', () => {
        const storage = createMemoryStorage();
        storage.setItem(
            AUTH_SESSION_STORAGE_KEY,
            JSON.stringify({
                ...buildSession(),
                ncryptsec: 'legacy-encrypted-private-key',
            })
        );

        const loaded = loadStoredAuthSession(storage);
        expect(loaded).toEqual(buildSession());
        expect((loaded as any)?.ncryptsec).toBeUndefined();
    });

    test('rejects and clears persisted payload with unsupported method', () => {
        const storage = createMemoryStorage();
        storage.setItem(
            AUTH_SESSION_STORAGE_KEY,
            JSON.stringify({
                ...buildSession(),
                method: 'foo',
            })
        );

        const loaded = loadStoredAuthSession(storage);
        expect(loaded).toBeUndefined();
        expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    });

    test('clearStoredAuthSession removes persisted payload', () => {
        const storage = createMemoryStorage();
        saveStoredAuthSession(buildSession(), storage);

        clearStoredAuthSession(storage);

        expect(loadStoredAuthSession(storage)).toBeUndefined();
    });
});
