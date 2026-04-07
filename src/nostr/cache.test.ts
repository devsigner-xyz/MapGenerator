import { describe, expect, test, vi } from 'vitest';
import { createTtlCache } from './cache';

describe('createTtlCache', () => {
    test('returns cached value before ttl', async () => {
        vi.useFakeTimers();
        const cache = createTtlCache<string>({ ttlMs: 1000 });
        const loader = vi.fn(async () => 'ok');

        const first = await cache.getOrLoad('k', loader);
        const second = await cache.getOrLoad('k', loader);

        expect(first).toBe('ok');
        expect(second).toBe('ok');
        expect(loader).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    test('deduplicates in-flight loads for the same key', async () => {
        const cache = createTtlCache<string>({ ttlMs: 1000 });
        let resolveLoader: ((value: string) => void) | undefined;
        const loader = vi.fn(() => new Promise<string>((resolve) => {
            resolveLoader = resolve;
        }));

        const firstPromise = cache.getOrLoad('k', loader);
        const secondPromise = cache.getOrLoad('k', loader);
        resolveLoader?.('ok');

        const [first, second] = await Promise.all([firstPromise, secondPromise]);
        expect(first).toBe('ok');
        expect(second).toBe('ok');
        expect(loader).toHaveBeenCalledTimes(1);
    });
});
