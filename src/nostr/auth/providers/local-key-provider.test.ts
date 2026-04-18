import { describe, expect, test } from 'vitest';
import { generateSecretKey } from 'nostr-tools/pure';
import { LocalKeyAuthProvider } from './local-key-provider';
import { AUTH_PROVIDER_ERROR } from './types';

describe('LocalKeyAuthProvider', () => {
    test('resolves writable local session with nip44 support', async () => {
        const provider = new LocalKeyAuthProvider();
        const secretKey = generateSecretKey();

        const session = await provider.resolveSession({ secretKey });

        expect(session.method).toBe('local');
        expect(session.readonly).toBe(false);
        expect(session.locked).toBe(false);
        expect(session.capabilities).toEqual({
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip44'],
        });
        expect(session.pubkey).toMatch(/^[a-f0-9]{64}$/);
    });

    test('signs events with the active local keypair', async () => {
        const provider = new LocalKeyAuthProvider();
        await provider.resolveSession({ secretKey: generateSecretKey() });

        const signed = await provider.signEvent({
            kind: 1,
            content: 'hello local signer',
            created_at: 123,
            tags: [],
        });

        expect(signed.pubkey).toMatch(/^[a-f0-9]{64}$/);
        expect(signed.id).toMatch(/^[a-f0-9]{64}$/);
        expect(signed.sig).toMatch(/^[a-f0-9]{128}$/);
    });

    test('encrypts and decrypts with nip44 using the active local keypair', async () => {
        const bobProvider = new LocalKeyAuthProvider();
        const bobSession = await bobProvider.resolveSession({ secretKey: generateSecretKey() });

        const aliceProvider = new LocalKeyAuthProvider();
        const aliceSession = await aliceProvider.resolveSession({ secretKey: generateSecretKey() });

        const ciphertext = await aliceProvider.encrypt(bobSession.pubkey, 'hola nip44', 'nip44');
        const plaintext = await bobProvider.decrypt(aliceSession.pubkey, ciphertext, 'nip44');

        expect(ciphertext).not.toBe('hola nip44');
        expect(plaintext).toBe('hola nip44');
    });

    test('throws locked error after lock', async () => {
        const provider = new LocalKeyAuthProvider();
        await provider.resolveSession({ secretKey: generateSecretKey() });
        await provider.lock();

        await expect(provider.signEvent({
            kind: 1,
            content: 'locked',
            created_at: 1,
            tags: [],
        })).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_LOCKED,
        });
    });

    test('rejects missing secret key input', async () => {
        const provider = new LocalKeyAuthProvider();

        await expect(provider.resolveSession({})).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
        });
    });

    test('rejects secret keys that are not 32 bytes', async () => {
        const provider = new LocalKeyAuthProvider();

        await expect(provider.resolveSession({ secretKey: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
        });
    });

    test('rejects secret keys that are 32 bytes but invalid on secp256k1', async () => {
        const provider = new LocalKeyAuthProvider();

        await expect(provider.resolveSession({ secretKey: new Uint8Array(32) })).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
        });
    });
});
