import { describe, expect, test } from 'vitest';
import {
    SPECIAL_BUILDING_IDS,
    buildSpecialBuildingAssignment,
    pickReservedBuildingIndices,
    type SpecialBuildingId,
} from './special_buildings';

describe('pickReservedBuildingIndices', () => {
    test('excludes invalid and explicitly excluded indexes', () => {
        const result = pickReservedBuildingIndices({
            buildingCount: 6,
            excludedBuildingIndexes: [0, 3, 99, -2],
            maxCount: 2,
            random: () => 0,
        });

        expect(result).toHaveLength(2);
        expect(result.includes(0)).toBe(false);
        expect(result.includes(3)).toBe(false);
    });

    test('returns empty when no eligible buildings remain', () => {
        const result = pickReservedBuildingIndices({
            buildingCount: 2,
            excludedBuildingIndexes: [0, 1],
            maxCount: 1,
            random: () => 0,
        });

        expect(result).toEqual([]);
    });
});

describe('buildSpecialBuildingAssignment', () => {
    test('assigns unique special ids to unique reserved buildings', () => {
        const assignment = buildSpecialBuildingAssignment({
            buildingCount: 8,
            excludedBuildingIndexes: [2, 6],
            random: () => 0,
        });

        const assignedIndexes = Object.keys(assignment).map((value) => Number(value));
        const assignedIds = Object.values(assignment);

        expect(new Set(assignedIndexes).size).toBe(assignedIndexes.length);
        expect(new Set(assignedIds).size).toBe(assignedIds.length);
        expect(assignedIds.every((value) => SPECIAL_BUILDING_IDS.includes(value))).toBe(true);
        expect(assignedIndexes.every((index) => index !== 2 && index !== 6)).toBe(true);
    });

    test('returns only available assignments when eligible buildings are fewer than ids', () => {
        const customIds: SpecialBuildingId[] = [
            'agora',
        ];

        const assignment = buildSpecialBuildingAssignment({
            buildingCount: 1,
            excludedBuildingIndexes: [0],
            specialBuildingIds: customIds,
            random: () => 0,
        });

        expect(Object.keys(assignment)).toHaveLength(0);
    });
});
