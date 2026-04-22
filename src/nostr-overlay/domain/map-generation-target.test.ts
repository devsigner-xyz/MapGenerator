import { describe, expect, test } from 'vitest';
import { buildFollowDrivenTargetBuildings } from './map-generation-target';

describe('buildFollowDrivenTargetBuildings', () => {
    test('returns the minimum city size for an empty follows list', () => {
        expect(buildFollowDrivenTargetBuildings({ follows: [] })).toBe(600);
    });

    test('returns the minimum city size for ten followed accounts', () => {
        expect(buildFollowDrivenTargetBuildings({
            follows: Array.from({ length: 10 }, (_, index) => `${index}`.padStart(64, 'a')),
        })).toBe(600);
    });

    test('returns the minimum city size for fifty unique follows', () => {
        expect(buildFollowDrivenTargetBuildings({
            follows: Array.from({ length: 50 }, (_, index) => index.toString(16).padStart(64, 'a').slice(-64)),
        })).toBe(600);
    });

    test('normalizes follows with trim and lowercase before deduping', () => {
        expect(buildFollowDrivenTargetBuildings({
            follows: ['AA', ' aa ', 'Aa'],
        })).toBe(600);
    });

    test('drops empty follows after normalization', () => {
        expect(buildFollowDrivenTargetBuildings({
            follows: ['', '  ', 'Alice', 'alice'],
        })).toBe(600);
    });

    test('continues growing above the floor for large follow counts', () => {
        expect(buildFollowDrivenTargetBuildings({
            follows: Array.from({ length: 5000 }, (_, index) => `${index}`.padStart(64, 'f').slice(-64)),
        })).toBeGreaterThan(5000);
    });

    test('caps extremely large follow counts at 10000 buildings', () => {
        expect(buildFollowDrivenTargetBuildings({
            follows: Array.from({ length: 20000 }, (_, index) => `${index}`.padStart(64, 'f').slice(-64)),
        })).toBe(10000);
    });
});
