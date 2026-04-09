import { describe, expect, test } from 'vitest';
import {
    AUTH_SESSION_STORAGE_KEY,
    clearStoredAuthSession,
    encryptPrivateKeyToNcryptsec,
    loadStoredAuthSession,
    lockSession,
    saveStoredAuthSession,
    unlockSession,
    type StoredAuthSession,
} from './secure-storage';

const SAMPLE_NSEC = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
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
        method: 'nsec',
        pubkey: SAMPLE_PUBKEY,
        readonly: false,
        locked: false,
        createdAt: 123,
        ncryptsec: encryptPrivateKeyToNcryptsec(SAMPLE_NSEC, 'password1234'),
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

    test('never stores plain nsec in persisted payload', () => {
        const storage = createMemoryStorage();
        const session = buildSession();

        saveStoredAuthSession(session, storage);
        const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY);

        expect(raw).not.toBeNull();
        expect(raw).not.toContain('nsec1');
        expect(raw).not.toContain('67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa');
    });

    test('lockSession marks session as locked', () => {
        const storage = createMemoryStorage();
        saveStoredAuthSession(buildSession({ locked: false }), storage);

        const locked = lockSession(storage);
        expect(locked?.locked).toBe(true);
    });

    test('unlockSession returns private key and unlocked session', () => {
        const storage = createMemoryStorage();
        saveStoredAuthSession(buildSession({ locked: true }), storage);

        const unlocked = unlockSession('password1234', storage);

        expect(unlocked.privateKeyHex).toBe('67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa');
        expect(unlocked.session.locked).toBe(false);

        const loaded = loadStoredAuthSession(storage);
        expect(loaded?.locked).toBe(false);
    });

    test('unlockSession throws for invalid passphrase', () => {
        const storage = createMemoryStorage();
        saveStoredAuthSession(buildSession({ locked: true }), storage);

        expect(() => unlockSession('wrong-passphrase', storage)).toThrow();
    });

    test('clearStoredAuthSession removes persisted payload', () => {
        const storage = createMemoryStorage();
        saveStoredAuthSession(buildSession(), storage);

        clearStoredAuthSession(storage);

        expect(loadStoredAuthSession(storage)).toBeUndefined();
    });
});
