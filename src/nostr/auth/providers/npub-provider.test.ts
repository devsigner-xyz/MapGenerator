import { describe, expect, test } from 'vitest';
import { NpubAuthProvider } from './npub-provider';
import { AUTH_PROVIDER_ERROR } from './types';

const SAMPLE_NPUB = 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';

describe('NpubAuthProvider', () => {
    test('resolves readonly session from npub credential', async () => {
        const provider = new NpubAuthProvider();

        const session = await provider.resolveSession({ credential: SAMPLE_NPUB });

        expect(session.method).toBe('npub');
        expect(session.readonly).toBe(true);
        expect(session.capabilities.canSign).toBe(false);
        expect(session.pubkey).toMatch(/^[a-f0-9]{64}$/);
    });

    test('throws standardized readonly error when signing', async () => {
        const provider = new NpubAuthProvider();

        await expect(
            provider.signEvent({
                kind: 1,
                content: 'hello',
                created_at: 1,
                tags: [],
            })
        ).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_READONLY,
        });
    });
});
