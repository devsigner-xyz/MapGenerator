import { describe, expect, test, vi } from 'vitest';
import { nextStreetLabelSeed } from './street_label_seed';

describe('street_label_seed', () => {
    test('keeps same seed while refresh is false', () => {
        const randomFn = vi.fn(() => 0.123456789);

        const first = nextStreetLabelSeed(undefined, false, randomFn);
        const second = nextStreetLabelSeed(first, false, randomFn);

        expect(second).toBe(first);
        expect(randomFn).toHaveBeenCalledTimes(1);
    });

    test('refreshes seed when refresh is true', () => {
        const randomFn = vi.fn()
            .mockReturnValueOnce(0.111111111)
            .mockReturnValueOnce(0.222222222);

        const first = nextStreetLabelSeed(undefined, false, randomFn);
        const refreshed = nextStreetLabelSeed(first, true, randomFn);

        expect(refreshed).not.toBe(first);
        expect(randomFn).toHaveBeenCalledTimes(2);
    });
});
