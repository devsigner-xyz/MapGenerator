import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import { createOccupiedBuildingSpatialIndex } from './occupied_building_spatial_index';

describe('occupied_building_spatial_index', () => {
    test('indexes occupied footprints and returns candidates in descending index order', () => {
        const footprints = [
            [new Vector(0, 0), new Vector(4, 0), new Vector(4, 4), new Vector(0, 4)],
            [new Vector(10, 10), new Vector(14, 10), new Vector(14, 14), new Vector(10, 14)],
            [new Vector(8, 8), new Vector(16, 8), new Vector(16, 16), new Vector(8, 16)],
        ];

        const index = createOccupiedBuildingSpatialIndex({
            footprints,
            occupiedPubkeyByBuildingIndex: {
                1: 'pubkey-1',
                2: 'pubkey-2',
            },
            cellSize: 8,
        });

        expect(index.query(new Vector(12, 12))).toEqual([2, 1]);
        expect(index.query(new Vector(2, 2))).toEqual([]);
    });
});
