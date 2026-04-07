import type { BuildingAssignment } from './assignment';

export interface OccupancyState {
    byBuildingIndex: Record<number, string>;
    pubkeyToBuildingIndex: Record<string, number>;
    selectedBuildingIndex?: number;
}

export function buildOccupancyState(input: {
    buildingsCount: number;
    assignments: BuildingAssignment[];
    selectedPubkey?: string;
}): OccupancyState {
    const capacity = Math.max(0, Math.floor(input.buildingsCount));
    const byBuildingIndex: Record<number, string> = {};
    const pubkeyToBuildingIndex: Record<string, number> = {};

    for (const assignment of input.assignments) {
        if (assignment.buildingIndex < 0 || assignment.buildingIndex >= capacity) {
            continue;
        }

        if (byBuildingIndex[assignment.buildingIndex]) {
            continue;
        }

        if (pubkeyToBuildingIndex[assignment.pubkey] !== undefined) {
            continue;
        }

        byBuildingIndex[assignment.buildingIndex] = assignment.pubkey;
        pubkeyToBuildingIndex[assignment.pubkey] = assignment.buildingIndex;
    }

    const selectedBuildingIndex =
        input.selectedPubkey && pubkeyToBuildingIndex[input.selectedPubkey] !== undefined
            ? pubkeyToBuildingIndex[input.selectedPubkey]
            : undefined;

    return {
        byBuildingIndex,
        pubkeyToBuildingIndex,
        selectedBuildingIndex,
    };
}
