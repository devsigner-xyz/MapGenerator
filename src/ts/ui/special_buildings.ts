export type SpecialBuildingId = 'agora';

export const SPECIAL_BUILDING_IDS: SpecialBuildingId[] = [
    'agora',
];

interface PickReservedBuildingIndicesInput {
    buildingCount: number;
    excludedBuildingIndexes?: number[];
    maxCount?: number;
    random?: () => number;
}

interface BuildSpecialBuildingAssignmentInput {
    buildingCount: number;
    specialBuildingIds?: SpecialBuildingId[];
    excludedBuildingIndexes?: number[];
    random?: () => number;
}

function normalizeExcludedIndexes(excludedBuildingIndexes: number[]): Set<number> {
    const normalized = new Set<number>();
    for (const value of excludedBuildingIndexes) {
        const candidate = Number(value);
        if (!Number.isInteger(candidate) || candidate < 0) {
            continue;
        }
        normalized.add(candidate);
    }
    return normalized;
}

export function pickReservedBuildingIndices({
    buildingCount,
    excludedBuildingIndexes = [],
    maxCount = SPECIAL_BUILDING_IDS.length,
    random = Math.random,
}: PickReservedBuildingIndicesInput): number[] {
    const safeBuildingCount = Number.isFinite(buildingCount) ? Math.max(0, Math.floor(buildingCount)) : 0;
    const safeMaxCount = Number.isFinite(maxCount) ? Math.max(0, Math.floor(maxCount)) : 0;

    if (safeBuildingCount === 0 || safeMaxCount === 0) {
        return [];
    }

    const excludedSet = normalizeExcludedIndexes(excludedBuildingIndexes);
    const availableBuildingIndexes: number[] = [];
    for (let index = 0; index < safeBuildingCount; index += 1) {
        if (!excludedSet.has(index)) {
            availableBuildingIndexes.push(index);
        }
    }

    if (availableBuildingIndexes.length <= safeMaxCount) {
        return availableBuildingIndexes;
    }

    for (let i = availableBuildingIndexes.length - 1; i > 0; i -= 1) {
        const randomValue = random();
        const normalizedRandom = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.9999999, randomValue)) : 0;
        const j = Math.floor(normalizedRandom * (i + 1));
        const current = availableBuildingIndexes[i];
        availableBuildingIndexes[i] = availableBuildingIndexes[j];
        availableBuildingIndexes[j] = current;
    }

    return availableBuildingIndexes.slice(0, safeMaxCount);
}

export function buildSpecialBuildingAssignment({
    buildingCount,
    specialBuildingIds = SPECIAL_BUILDING_IDS,
    excludedBuildingIndexes = [],
    random = Math.random,
}: BuildSpecialBuildingAssignmentInput): Record<number, SpecialBuildingId> {
    const reservedBuildingIndexes = pickReservedBuildingIndices({
        buildingCount,
        excludedBuildingIndexes,
        maxCount: specialBuildingIds.length,
        random,
    });

    const assignment: Record<number, SpecialBuildingId> = {};
    for (let i = 0; i < reservedBuildingIndexes.length; i += 1) {
        assignment[reservedBuildingIndexes[i]] = specialBuildingIds[i];
    }

    return assignment;
}
