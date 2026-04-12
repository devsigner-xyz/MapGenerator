import { describe, expect, test } from 'vitest';
import {
    EASTER_EGG_IDS,
    buildEasterEggAssignment,
    pickEmptyBuildingIndices,
    type EasterEggId,
} from './easter_eggs';

describe('pickEmptyBuildingIndices', () => {
    test('returns only empty building indexes', () => {
        const result = pickEmptyBuildingIndices({
            buildingCount: 6,
            occupiedPubkeyByBuildingIndex: {
                1: 'pubkey-a',
                4: 'pubkey-b',
            },
            maxCount: 3,
            random: () => 0,
        });

        expect(result.every((index) => index !== 1 && index !== 4)).toBe(true);
    });

    test('returns no more than maxCount indexes', () => {
        const result = pickEmptyBuildingIndices({
            buildingCount: 50,
            occupiedPubkeyByBuildingIndex: {},
            maxCount: 3,
            random: () => 0.5,
        });

        expect(result.length).toBe(3);
    });

    test('returns empty when there are no eligible buildings', () => {
        const result = pickEmptyBuildingIndices({
            buildingCount: 3,
            occupiedPubkeyByBuildingIndex: {
                0: 'a',
                1: 'b',
                2: 'c',
            },
            maxCount: 3,
            random: () => 0,
        });

        expect(result).toEqual([]);
    });

    test('skips explicitly excluded empty indexes', () => {
        const result = pickEmptyBuildingIndices({
            buildingCount: 7,
            occupiedPubkeyByBuildingIndex: {
                1: 'occupied',
            },
            excludedBuildingIndexes: [0, 3, 99],
            maxCount: 4,
            random: () => 0,
        });

        expect(result.includes(0)).toBe(false);
        expect(result.includes(3)).toBe(false);
        expect(result.includes(1)).toBe(false);
    });
});

describe('buildEasterEggAssignment', () => {
    test('assigns unique easter egg ids to unique empty buildings', () => {
        const assignment = buildEasterEggAssignment({
            buildingCount: 8,
            occupiedPubkeyByBuildingIndex: {
                2: 'pubkey',
                6: 'pubkey2',
            },
            random: () => 0,
        });

        const keys = Object.keys(assignment).map((value) => Number(value));
        const values = Object.values(assignment);

        expect(new Set(keys).size).toBe(keys.length);
        expect(new Set(values).size).toBe(values.length);
        expect(values.every((value) => EASTER_EGG_IDS.includes(value))).toBe(true);
        expect(keys.every((index) => index !== 2 && index !== 6)).toBe(true);
    });

    test('returns only available assignments when empty buildings are fewer than ids', () => {
        const customIds: EasterEggId[] = [
            'bitcoin_whitepaper',
            'crypto_anarchist_manifesto',
            'cyberspace_independence',
        ];

        const assignment = buildEasterEggAssignment({
            buildingCount: 2,
            occupiedPubkeyByBuildingIndex: {
                0: 'pubkey',
            },
            easterEggIds: customIds,
            random: () => 0,
        });

        expect(Object.keys(assignment)).toHaveLength(1);
    });

    test('never assigns easter eggs into explicitly excluded indexes', () => {
        const assignment = buildEasterEggAssignment({
            buildingCount: 12,
            occupiedPubkeyByBuildingIndex: {},
            excludedBuildingIndexes: [2, 4, 6, 8],
            random: () => 0,
        });

        const assignedIndexes = Object.keys(assignment).map((value) => Number(value));
        expect(assignedIndexes.some((index) => [2, 4, 6, 8].includes(index))).toBe(false);
    });
});
