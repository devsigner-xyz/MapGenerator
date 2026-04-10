import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import { findBuildingHit, findOccupiedBuildingHit } from './occupied_building_hit';

describe('findBuildingHit', () => {
    test('returns the building index when point intersects any footprint', () => {
        const footprints = [
            [new Vector(0, 0), new Vector(4, 0), new Vector(4, 4), new Vector(0, 4)],
            [new Vector(10, 10), new Vector(14, 10), new Vector(14, 14), new Vector(10, 14)],
        ];

        const hit = findBuildingHit({
            point: new Vector(2, 2),
            footprints,
        });

        expect(hit).toEqual({ index: 0 });
    });

    test('returns null when point does not intersect any footprint', () => {
        const hit = findBuildingHit({
            point: new Vector(100, 100),
            footprints: [[new Vector(0, 0), new Vector(4, 0), new Vector(4, 4), new Vector(0, 4)]],
        });

        expect(hit).toBeNull();
    });
});

describe('findOccupiedBuildingHit', () => {
    test('returns occupied building hit with pubkey', () => {
        const footprints = [
            [new Vector(0, 0), new Vector(4, 0), new Vector(4, 4), new Vector(0, 4)],
            [new Vector(10, 10), new Vector(14, 10), new Vector(14, 14), new Vector(10, 14)],
        ];

        const hit = findOccupiedBuildingHit({
            point: new Vector(11, 11),
            footprints,
            occupiedPubkeyByBuildingIndex: {
                1: 'pubkey-b',
            },
        });

        expect(hit).toEqual({
            index: 1,
            pubkey: 'pubkey-b',
        });
    });

    test('returns null when building is not occupied', () => {
        const footprints = [
            [new Vector(0, 0), new Vector(4, 0), new Vector(4, 4), new Vector(0, 4)],
        ];

        const hit = findOccupiedBuildingHit({
            point: new Vector(2, 2),
            footprints,
            occupiedPubkeyByBuildingIndex: {},
        });

        expect(hit).toBeNull();
    });
});
