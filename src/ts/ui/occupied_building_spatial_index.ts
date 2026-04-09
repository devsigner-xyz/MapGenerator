import Vector from '../vector';

export interface OccupiedBuildingSpatialIndex {
    query: (point: Vector) => number[];
}

interface CreateOccupiedBuildingSpatialIndexInput {
    footprints: Vector[][];
    occupiedPubkeyByBuildingIndex: Record<number, string>;
    cellSize?: number;
}

interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

const DEFAULT_CELL_SIZE = 120;

function computeBounds(polygon: Vector[]): Bounds | null {
    if (!polygon || polygon.length === 0) {
        return null;
    }

    let minX = polygon[0].x;
    let minY = polygon[0].y;
    let maxX = polygon[0].x;
    let maxY = polygon[0].y;

    for (let i = 1; i < polygon.length; i++) {
        const point = polygon[i];
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    return { minX, minY, maxX, maxY };
}

function cellKey(x: number, y: number): string {
    return `${x}:${y}`;
}

export function createOccupiedBuildingSpatialIndex(
    input: CreateOccupiedBuildingSpatialIndexInput,
): OccupiedBuildingSpatialIndex {
    const cellSize = Math.max(8, input.cellSize || DEFAULT_CELL_SIZE);
    const cellMap = new Map<string, Set<number>>();

    const occupiedIndices = Object.keys(input.occupiedPubkeyByBuildingIndex)
        .map((indexKey) => Number(indexKey))
        .filter((index) => Number.isInteger(index) && index >= 0)
        .sort((left, right) => right - left);

    for (const index of occupiedIndices) {
        const polygon = input.footprints[index];
        const bounds = computeBounds(polygon);
        if (!bounds) {
            continue;
        }

        const minCellX = Math.floor(bounds.minX / cellSize);
        const maxCellX = Math.floor(bounds.maxX / cellSize);
        const minCellY = Math.floor(bounds.minY / cellSize);
        const maxCellY = Math.floor(bounds.maxY / cellSize);

        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
            for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
                const key = cellKey(cellX, cellY);
                if (!cellMap.has(key)) {
                    cellMap.set(key, new Set<number>());
                }

                cellMap.get(key)?.add(index);
            }
        }
    }

    const sortedCellMap = new Map<string, number[]>();
    for (const [key, indices] of cellMap.entries()) {
        sortedCellMap.set(key, [...indices].sort((left, right) => right - left));
    }

    return {
        query(point: Vector): number[] {
            const x = Math.floor(point.x / cellSize);
            const y = Math.floor(point.y / cellSize);
            return sortedCellMap.get(cellKey(x, y)) || [];
        },
    };
}
