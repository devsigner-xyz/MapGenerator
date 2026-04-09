import { afterEach, describe, expect, test, vi } from 'vitest';
import { Nip07AuthProvider } from './nip07-provider';
import { AUTH_PROVIDER_ERROR } from './types';

const SAMPLE_PUBKEY = 'a'.repeat(64);

describe('Nip07AuthProvider', () => {
    afterEach(() => {
        delete (window as any).nostr;
    });

    test('resolves writable session when extension is available', async () => {
        (window as any).nostr = {
            getPublicKey: vi.fn().mockResolvedValue(SAMPLE_PUBKEY),
            signEvent: vi.fn().mockResolvedValue({ sig: 'b'.repeat(128) }),
            nip44: {
                encrypt: vi.fn(),
                decrypt: vi.fn(),
            },
        };

        const provider = new Nip07AuthProvider();
        const session = await provider.resolveSession({});

        expect(session.method).toBe('nip07');
        expect(session.readonly).toBe(false);
        expect(session.capabilities.canSign).toBe(true);
        expect(session.capabilities.canEncrypt).toBe(true);
        expect(session.capabilities.encryptionSchemes).toContain('nip44');
        expect(session.pubkey).toBe(SAMPLE_PUBKEY);
    });

    test('throws provider unavailable error when extension is missing', async () => {
        const provider = new Nip07AuthProvider();

        await expect(provider.resolveSession({})).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });

    test('signs event using extension signer', async () => {
        (window as any).nostr = {
            getPublicKey: vi.fn().mockResolvedValue(SAMPLE_PUBKEY),
            signEvent: vi.fn().mockResolvedValue({ sig: 'b'.repeat(128) }),
        };

        const provider = new Nip07AuthProvider();
        await provider.resolveSession({});
        const signed = await provider.signEvent({
            kind: 1,
            content: 'hello extension',
            created_at: 123,
            tags: [],
        });

        expect(signed.pubkey).toBe(SAMPLE_PUBKEY);
        expect(signed.id).toMatch(/^[a-f0-9]{64}$/);
        expect(signed.sig).toMatch(/^[a-f0-9]{128}$/);
    });
});
