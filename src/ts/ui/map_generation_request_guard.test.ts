import { describe, expect, test, vi } from 'vitest';
import { createLatestRequestRunner } from './map_generation_request_guard';

describe('createLatestRequestRunner', () => {
    test('serializes work and keeps only the latest pending request', async () => {
        const started: string[] = [];
        const releases: Array<() => void> = [];
        const runner = createLatestRequestRunner<string>(async (value) => {
            started.push(value);
            await new Promise<void>((resolve) => releases.push(resolve));
        });

        const first = runner('first');
        const second = runner('second');
        const third = runner('third');

        expect(started).toEqual(['first']);

        releases.shift()?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(started).toEqual(['first', 'third']);

        releases.shift()?.();
        await first;
        await second;
        await third;
        expect(started).toEqual(['first', 'third']);
    });

    test('returns a different promise for a pending request that will run later', async () => {
        const run = vi.fn(async () => undefined);
        const runner = createLatestRequestRunner(run);

        const first = runner('a');
        const second = runner('b');

        expect(first).not.toBe(second);
        await second;
        expect(run).toHaveBeenCalledTimes(2);
    });

    test('recovers from a failed run and accepts new work afterwards', async () => {
        const run = vi.fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(undefined);
        const runner = createLatestRequestRunner(run);

        await expect(runner('first')).rejects.toThrow('boom');
        await expect(runner('second')).resolves.toBeUndefined();

        expect(run).toHaveBeenNthCalledWith(1, 'first');
        expect(run).toHaveBeenNthCalledWith(2, 'second');
    });
});
