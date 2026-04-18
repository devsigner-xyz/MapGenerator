import { describe, expect, test } from 'vitest';
import { assignPubkeysToBuildings } from './assignment';
import { buildOccupancyState } from './occupancy';

const PUBKEYS = [
    '1'.repeat(64),
    '2'.repeat(64),
    '3'.repeat(64),
    '4'.repeat(64),
];

describe('assignPubkeysToBuildings', () => {
    test('same pubkeys and seed returns stable assignments', () => {
        const first = assignPubkeysToBuildings({
            pubkeys: PUBKEYS,
            buildingsCount: 3,
            seed: 'owner-pubkey',
        });

        const second = assignPubkeysToBuildings({
            pubkeys: [...PUBKEYS].reverse(),
            buildingsCount: 3,
            seed: 'owner-pubkey',
        });

        expect(first.byBuildingIndex).toEqual(second.byBuildingIndex);
        expect(first.pubkeyToBuildingIndex).toEqual(second.pubkeyToBuildingIndex);
    });

    test('assignments are unique while building capacity exists', () => {
        const result = assignPubkeysToBuildings({
            pubkeys: PUBKEYS,
            buildingsCount: 4,
            seed: 'owner-pubkey',
        });

        const usedIndices = Object.values(result.pubkeyToBuildingIndex);
        const uniqueIndices = new Set(usedIndices);

        expect(uniqueIndices.size).toBe(usedIndices.length);
        expect(usedIndices.length).toBe(4);
    });

    test('unassigned follows are tracked and buildings can remain empty', () => {
        const result = assignPubkeysToBuildings({
            pubkeys: PUBKEYS,
            buildingsCount: 2,
            seed: 'owner-pubkey',
        });

        expect(Object.keys(result.byBuildingIndex)).toHaveLength(2);
        expect(result.unassignedPubkeys).toHaveLength(2);

        const selectedPubkey = result.assignments[0]?.pubkey;
        const occupancy = buildOccupancyState(
            selectedPubkey === undefined
                ? {
                    buildingsCount: 5,
                    assignments: result.assignments,
                }
                : {
                    buildingsCount: 5,
                    assignments: result.assignments,
                    selectedPubkey,
                }
        );

        expect(Object.keys(occupancy.byBuildingIndex)).toHaveLength(2);
        expect(occupancy.selectedBuildingIndex).toBeDefined();
    });

    test('priority pubkeys are assigned first when capacity is limited', () => {
        const priorityOne = PUBKEYS[2] ?? '3'.repeat(64);
        const priorityTwo = PUBKEYS[3] ?? '4'.repeat(64);
        const firstPubkey = PUBKEYS[0] ?? '1'.repeat(64);
        const secondPubkey = PUBKEYS[1] ?? '2'.repeat(64);

        const result = assignPubkeysToBuildings({
            pubkeys: PUBKEYS,
            buildingsCount: 2,
            seed: 'owner-pubkey',
            priorityPubkeys: [priorityOne, priorityTwo],
        });

        expect(result.pubkeyToBuildingIndex[priorityOne]).toBeDefined();
        expect(result.pubkeyToBuildingIndex[priorityTwo]).toBeDefined();
        expect(result.unassignedPubkeys).toContain(firstPubkey);
        expect(result.unassignedPubkeys).toContain(secondPubkey);
    });

    test('never assigns pubkeys to excluded building indexes', () => {
        const result = assignPubkeysToBuildings({
            pubkeys: PUBKEYS,
            buildingsCount: 6,
            seed: 'owner-pubkey',
            excludedBuildingIndexes: [1, 3, 5],
        });

        const assignedIndexes = Object.values(result.pubkeyToBuildingIndex);
        expect(assignedIndexes.some((index) => [1, 3, 5].includes(index))).toBe(false);
    });
});
