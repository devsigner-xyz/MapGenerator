import { afterEach, describe, expect, test, vi } from 'vitest';
import { createAuthService } from './auth-service';
import { AUTH_SESSION_STORAGE_KEY } from './secure-storage';
import { AUTH_PROVIDER_ERROR } from './providers/types';

const SAMPLE_NPUB = 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';
const SAMPLE_NSEC = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';

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

describe('createAuthService', () => {
    afterEach(() => {
        delete (window as any).nostr;
    });

    test('starts npub readonly session and persists it', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage, now: () => 111 });

        const session = await auth.startSession('npub', { credential: SAMPLE_NPUB });

        expect(session.method).toBe('npub');
        expect(session.readonly).toBe(true);
        expect(session.createdAt).toBe(111);

        const persisted = storage.getItem(AUTH_SESSION_STORAGE_KEY);
        expect(persisted).not.toBeNull();
    });

    test('starts nsec session and stores only ncryptsec payload', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });

        const session = await auth.startSession('nsec', {
            credential: SAMPLE_NSEC,
            passphrase: 'password1234',
        });

        expect(session.method).toBe('nsec');
        expect(session.readonly).toBe(false);
        expect(session.locked).toBe(false);

        const persisted = storage.getItem(AUTH_SESSION_STORAGE_KEY);
        expect(persisted).not.toBeNull();
        expect(persisted).not.toContain('nsec1');
    });

    test('restores session from persisted state', async () => {
        const storage = createMemoryStorage();
        const authA = createAuthService({ storage });
        await authA.startSession('npub', { credential: SAMPLE_NPUB });

        const authB = createAuthService({ storage });
        const restored = await authB.restoreSession();

        expect(restored?.method).toBe('npub');
        expect(restored?.pubkey).toBeDefined();
        expect(authB.getSession()?.method).toBe('npub');
    });

    test('switchMethod updates active session', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });

        await auth.startSession('npub', { credential: SAMPLE_NPUB });
        const switched = await auth.switchMethod('nsec', {
            credential: SAMPLE_NSEC,
            passphrase: 'password1234',
        });

        expect(switched.method).toBe('nsec');
        expect(auth.getSession()?.method).toBe('nsec');
    });

    test('supports nip07 flow with browser extension', async () => {
        (window as any).nostr = {
            getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
            signEvent: vi.fn().mockResolvedValue({ sig: 'b'.repeat(128) }),
            nip44: {
                encrypt: vi.fn(),
                decrypt: vi.fn(),
            },
        };

        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });
        const session = await auth.startSession('nip07', {});

        expect(session.method).toBe('nip07');
        expect(session.readonly).toBe(false);
        expect(session.capabilities.canEncrypt).toBe(true);
    });

    test('returns provider unavailable for nip46 when runtime adapter is not configured', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });

        await expect(
            auth.startSession('nip46', {
                bunkerUri: `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`,
            })
        ).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });

    test('logout clears persisted session and notifies subscribers', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });
        const listener = vi.fn();

        auth.subscribe(listener);
        await auth.startSession('npub', { credential: SAMPLE_NPUB });
        await auth.logout();

        expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
        expect(auth.getSession()).toBeUndefined();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    test('locks and unlocks nsec session with passphrase', async () => {
        const storage = createMemoryStorage();
        const auth = createAuthService({ storage });

        await auth.startSession('nsec', {
            credential: SAMPLE_NSEC,
            passphrase: 'password1234',
        });

        const locked = await auth.lockSession();
        expect(locked?.locked).toBe(true);

        const unlocked = await auth.unlockSession('password1234');
        expect(unlocked.method).toBe('nsec');
        expect(unlocked.locked).toBe(false);
    });
});
