import { describe, expect, test } from 'vitest';
import { verifyEvent } from 'nostr-tools';
import { encryptPrivateKeyToNcryptsec } from '../secure-storage';
import { NsecAuthProvider } from './nsec-provider';
import { AUTH_PROVIDER_ERROR } from './types';

const SAMPLE_NSEC = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';

describe('NsecAuthProvider', () => {
    test('resolves writable session from nsec credential', async () => {
        const provider = new NsecAuthProvider();
        const session = await provider.resolveSession({ credential: SAMPLE_NSEC });

        expect(session.method).toBe('nsec');
        expect(session.readonly).toBe(false);
        expect(session.locked).toBe(false);
        expect(session.capabilities.canSign).toBe(true);
        expect(session.pubkey).toMatch(/^[a-f0-9]{64}$/);
    });

    test('resolves writable session from ncryptsec payload', async () => {
        const provider = new NsecAuthProvider();
        const ncryptsec = encryptPrivateKeyToNcryptsec(SAMPLE_NSEC, 'password1234');

        const session = await provider.resolveSession({
            ncryptsec,
            passphrase: 'password1234',
        });

        expect(session.method).toBe('nsec');
        expect(session.readonly).toBe(false);
    });

    test('signs event with active signer', async () => {
        const provider = new NsecAuthProvider();
        const session = await provider.resolveSession({ credential: SAMPLE_NSEC });

        const signed = await provider.signEvent({
            kind: 1,
            content: 'hola nostr',
            created_at: 1,
            tags: [['t', 'demo']],
        });

        expect(signed.pubkey).toBe(session.pubkey);
        expect(signed.id).toMatch(/^[a-f0-9]{64}$/);
        expect(signed.sig).toMatch(/^[a-f0-9]{128}$/);
        expect(verifyEvent(signed as any)).toBe(true);
    });

    test('throws locked error after lock', async () => {
        const provider = new NsecAuthProvider();
        await provider.resolveSession({ credential: SAMPLE_NSEC });
        await provider.lock();

        await expect(
            provider.signEvent({
                kind: 1,
                content: 'hola',
                created_at: 1,
                tags: [],
            })
        ).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_LOCKED,
        });
    });

    test('fails when ncryptsec passphrase is invalid', async () => {
        const provider = new NsecAuthProvider();
        const ncryptsec = encryptPrivateKeyToNcryptsec(SAMPLE_NSEC, 'password1234');

        await expect(
            provider.resolveSession({
                ncryptsec,
                passphrase: 'invalid-passphrase',
            })
        ).rejects.toThrow();
    });
});
