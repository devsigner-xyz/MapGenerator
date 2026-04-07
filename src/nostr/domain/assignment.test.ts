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

        const occupancy = buildOccupancyState({
            buildingsCount: 5,
            assignments: result.assignments,
            selectedPubkey: result.assignments[0]?.pubkey,
        });

        expect(Object.keys(occupancy.byBuildingIndex)).toHaveLength(2);
        expect(occupancy.selectedBuildingIndex).toBeDefined();
    });
});
