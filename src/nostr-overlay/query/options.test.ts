import { describe, expect, test } from 'vitest';
import { createSocialQueryOptions } from './options';

describe('createSocialQueryOptions', () => {
    test('retries relay/network errors with bounded attempts', () => {
        const options = createSocialQueryOptions({ queryKey: ['social'], queryFn: async () => [] as string[] });
        const retry = options.retry as (failureCount: number, error: unknown) => boolean;

        expect(retry(0, new Error('relay timeout'))).toBe(true);
        expect(retry(1, new Error('network disconnected'))).toBe(true);
        expect(retry(2, new Error('relay timeout'))).toBe(false);
    });

    test('uses exponential backoff delay for relay errors', () => {
        const options = createSocialQueryOptions({ queryKey: ['social'], queryFn: async () => [] as string[] });
        const retryDelay = options.retryDelay as (attempt: number, error: unknown) => number;

        expect(retryDelay(1, new Error('relay timeout'))).toBeGreaterThan(0);
        expect(retryDelay(3, new Error('relay timeout'))).toBeGreaterThan(retryDelay(1, new Error('relay timeout')));
        expect(retryDelay(1, new Error('unexpected parse error'))).toBe(0);
    });
});
