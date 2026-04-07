import { describe, expect, test, vi } from 'vitest';
import { createFollowerBatcher } from './follower-batcher';

describe('createFollowerBatcher', () => {
    test('coalesces multiple updates into one flush', async () => {
        vi.useFakeTimers();
        const flushed: string[][] = [];
        const batcher = createFollowerBatcher((pubkeys) => {
            flushed.push(pubkeys);
        }, 200);

        batcher.add(['a']);
        batcher.add(['b', 'a']);

        expect(flushed).toEqual([]);

        vi.advanceTimersByTime(200);
        await Promise.resolve();

        expect(flushed).toEqual([['a', 'b']]);
        vi.useRealTimers();
    });
});
