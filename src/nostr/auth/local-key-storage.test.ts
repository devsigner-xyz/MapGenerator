import { describe, expect, test } from 'vitest';
import { createLocalKeyStorage } from './local-key-storage';

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

function createMemoryDeviceKeyStore() {
    const values = new Map<string, CryptoKey>();

    return {
        async get(pubkey: string) {
            return values.get(pubkey);
        },
        async getOrCreate(pubkey: string) {
            const existing = values.get(pubkey);
            if (existing) {
                return existing;
            }

            const created = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            values.set(pubkey, created);
            return created;
        },
        async delete(pubkey: string) {
            values.delete(pubkey);
        },
    };
}

describe('createLocalKeyStorage', () => {
    test('saves and restores device-protected local key material', async () => {
        const storage = createMemoryStorage();
        const keyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore: keyStore });
        const secretKey = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));
        const pubkey = 'a'.repeat(64);

        await localKeyStorage.save({ pubkey, secretKey });
        const loaded = await localKeyStorage.load({ pubkey });

        expect(loaded).toEqual({
            status: 'available',
            mode: 'device',
            secretKey,
        });
    });

    test('saves and restores passphrase-protected local key material', async () => {
        const storage = createMemoryStorage();
        const keyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore: keyStore });
        const secretKey = new Uint8Array(Array.from({ length: 32 }, (_, index) => 255 - index));
        const pubkey = 'b'.repeat(64);

        await localKeyStorage.save({ pubkey, secretKey, passphrase: 'correct horse battery staple' });
        const loaded = await localKeyStorage.load({ pubkey, passphrase: 'correct horse battery staple' });

        expect(loaded).toEqual({
            status: 'available',
            mode: 'passphrase',
            secretKey,
        });
    });

    test('returns locked for passphrase-protected material without passphrase', async () => {
        const storage = createMemoryStorage();
        const keyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore: keyStore });
        const secretKey = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 11));
        const pubkey = 'c'.repeat(64);

        await localKeyStorage.save({ pubkey, secretKey, passphrase: 'secret-passphrase' });
        const loaded = await localKeyStorage.load({ pubkey });

        expect(loaded).toEqual({
            status: 'locked',
            mode: 'passphrase',
        });
    });

    test('clears persisted local key material and device key', async () => {
        const storage = createMemoryStorage();
        const keyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore: keyStore });
        const pubkey = 'd'.repeat(64);
        const secretKey = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 21));

        await localKeyStorage.save({ pubkey, secretKey });
        await localKeyStorage.clear(pubkey);

        await expect(localKeyStorage.inspect(pubkey)).resolves.toBeUndefined();
        await expect(localKeyStorage.inspectSavedAccount()).resolves.toBeUndefined();
        await expect(localKeyStorage.load({ pubkey })).resolves.toEqual({ status: 'missing' });
    });

    test('tracks the last saved local account for later login re-entry', async () => {
        const storage = createMemoryStorage();
        const keyStore = createMemoryDeviceKeyStore();
        const localKeyStorage = createLocalKeyStorage({ storage, deviceKeyStore: keyStore });
        const pubkey = 'e'.repeat(64);
        const secretKey = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 31));

        await localKeyStorage.save({ pubkey, secretKey, passphrase: 'local-passphrase' });

        await expect(localKeyStorage.inspectSavedAccount()).resolves.toEqual({
            pubkey,
            mode: 'passphrase',
        });
    });
});
