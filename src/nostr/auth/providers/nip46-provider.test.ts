import { describe, expect, test } from 'vitest';
import { Nip46AuthProvider } from './nip46-provider';
import { AUTH_PROVIDER_ERROR } from './types';

describe('Nip46AuthProvider', () => {
    test('exposes feature flag placeholder and throws not available', async () => {
        const provider = new Nip46AuthProvider();

        expect(provider.isEnabled()).toBe(false);

        await expect(provider.resolveSession({ bunkerUri: 'bunker://demo' })).rejects.toMatchObject({
            code: AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        });
    });
});
