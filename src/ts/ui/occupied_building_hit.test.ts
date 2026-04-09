import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import { findOccupiedBuildingHit } from './occupied_building_hit';
import { createOccupiedBuildingSpatialIndex } from './occupied_building_spatial_index';

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

    test('supports spatial index candidate narrowing', () => {
        const footprints = [
            [new Vector(0, 0), new Vector(4, 0), new Vector(4, 4), new Vector(0, 4)],
            [new Vector(10, 10), new Vector(14, 10), new Vector(14, 14), new Vector(10, 14)],
            [new Vector(8, 8), new Vector(16, 8), new Vector(16, 16), new Vector(8, 16)],
        ];

        const occupiedPubkeyByBuildingIndex = {
            1: 'pubkey-b',
            2: 'pubkey-c',
        };

        const spatialIndex = createOccupiedBuildingSpatialIndex({
            footprints,
            occupiedPubkeyByBuildingIndex,
            cellSize: 8,
        });

        const hit = findOccupiedBuildingHit({
            point: new Vector(12, 12),
            footprints,
            occupiedPubkeyByBuildingIndex,
            spatialIndex,
        });

        expect(hit).toEqual({
            index: 2,
            pubkey: 'pubkey-c',
        });
    });
});
