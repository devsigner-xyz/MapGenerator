export type EasterEggId = 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence';

export const EASTER_EGG_IDS: EasterEggId[] = [
    'bitcoin_whitepaper',
    'crypto_anarchist_manifesto',
    'cyberspace_independence',
];

interface PickEmptyBuildingIndicesInput {
    buildingCount: number;
    occupiedPubkeyByBuildingIndex: Record<number, string>;
    excludedBuildingIndexes?: number[];
    maxCount?: number;
    random?: () => number;
}

interface BuildEasterEggAssignmentInput {
    buildingCount: number;
    occupiedPubkeyByBuildingIndex: Record<number, string>;
    excludedBuildingIndexes?: number[];
    easterEggIds?: EasterEggId[];
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

export function pickEmptyBuildingIndices({
    buildingCount,
    occupiedPubkeyByBuildingIndex,
    excludedBuildingIndexes = [],
    maxCount = EASTER_EGG_IDS.length,
    random = Math.random,
}: PickEmptyBuildingIndicesInput): number[] {
    const safeBuildingCount = Number.isFinite(buildingCount) ? Math.max(0, Math.floor(buildingCount)) : 0;
    const safeMaxCount = Number.isFinite(maxCount) ? Math.max(0, Math.floor(maxCount)) : 0;

    if (safeBuildingCount === 0 || safeMaxCount === 0) {
        return [];
    }

    const excludedSet = normalizeExcludedIndexes(excludedBuildingIndexes);
    const emptyBuildingIndices: number[] = [];
    for (let index = 0; index < safeBuildingCount; index++) {
        if (!occupiedPubkeyByBuildingIndex[index] && !excludedSet.has(index)) {
            emptyBuildingIndices.push(index);
        }
    }

    if (emptyBuildingIndices.length <= safeMaxCount) {
        return emptyBuildingIndices;
    }

    for (let i = emptyBuildingIndices.length - 1; i > 0; i--) {
        const randomValue = random();
        const normalizedRandom = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.9999999, randomValue)) : 0;
        const j = Math.floor(normalizedRandom * (i + 1));
        const current = emptyBuildingIndices[i];
        const target = emptyBuildingIndices[j];
        if (current === undefined || target === undefined) {
            continue;
        }

        emptyBuildingIndices[i] = target;
        emptyBuildingIndices[j] = current;
    }

    return emptyBuildingIndices.slice(0, safeMaxCount);
}

export function buildEasterEggAssignment({
    buildingCount,
    occupiedPubkeyByBuildingIndex,
    excludedBuildingIndexes = [],
    easterEggIds = EASTER_EGG_IDS,
    random = Math.random,
}: BuildEasterEggAssignmentInput): Record<number, EasterEggId> {
    const selectedBuildingIndices = pickEmptyBuildingIndices({
        buildingCount,
        occupiedPubkeyByBuildingIndex,
        excludedBuildingIndexes,
        maxCount: easterEggIds.length,
        random,
    });

    const assignment: Record<number, EasterEggId> = {};
    for (let i = 0; i < selectedBuildingIndices.length; i++) {
        const buildingIndex = selectedBuildingIndices[i];
        const easterEggId = easterEggIds[i];
        if (buildingIndex === undefined || easterEggId === undefined) {
            continue;
        }

        assignment[buildingIndex] = easterEggId;
    }

    return assignment;
}
