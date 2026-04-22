import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import { calculateGeneratedMapCoverView } from './map_view_fit';

describe('calculateGeneratedMapCoverView', () => {
    test('returns null when there is no generated geometry', () => {
        expect(calculateGeneratedMapCoverView({
            screenDimensions: new Vector(1200, 800),
            footprints: [],
            centroids: [],
        })).toBeNull();
    });

    test('uses building footprints to compute the center', () => {
        const result = calculateGeneratedMapCoverView({
            screenDimensions: new Vector(1200, 800),
            footprints: [[
                new Vector(100, 200),
                new Vector(300, 200),
                new Vector(300, 500),
                new Vector(100, 500),
            ]],
            centroids: [new Vector(999, 999)],
        });

        expect(result).not.toBeNull();
        expect(result?.center).toEqual(new Vector(200, 350));
    });

    test('falls back to centroids when there are no footprints', () => {
        const result = calculateGeneratedMapCoverView({
            screenDimensions: new Vector(1200, 800),
            footprints: [],
            centroids: [new Vector(100, 200), new Vector(300, 500)],
        });

        expect(result).not.toBeNull();
        expect(result?.center).toEqual(new Vector(200, 350));
    });

    test('computes a cover zoom that fills the viewport instead of containing it', () => {
        const result = calculateGeneratedMapCoverView({
            screenDimensions: new Vector(1200, 800),
            footprints: [[
                new Vector(0, 0),
                new Vector(400, 0),
                new Vector(400, 100),
                new Vector(0, 100),
            ]],
            centroids: [],
        });

        expect(result).not.toBeNull();
        expect(result?.zoom).toBeGreaterThanOrEqual(8);
    });

    test('respects viewport inset because it only uses available screen dimensions', () => {
        const full = calculateGeneratedMapCoverView({
            screenDimensions: new Vector(1200, 800),
            footprints: [[
                new Vector(0, 0),
                new Vector(300, 0),
                new Vector(300, 300),
                new Vector(0, 300),
            ]],
            centroids: [],
        });
        const inset = calculateGeneratedMapCoverView({
            screenDimensions: new Vector(900, 800),
            footprints: [[
                new Vector(0, 0),
                new Vector(300, 0),
                new Vector(300, 300),
                new Vector(0, 300),
            ]],
            centroids: [],
        });

        expect(full).not.toBeNull();
        expect(inset).not.toBeNull();
        expect(inset!.zoom).toBeLessThan(full!.zoom);
    });
});
