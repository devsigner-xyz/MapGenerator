import Vector from '../vector';
import type { OccupiedBuildingSpatialIndex } from './occupied_building_spatial_index';

export interface OccupiedBuildingHit {
    index: number;
    pubkey: string;
}

interface FindOccupiedBuildingHitInput {
    point: Vector;
    footprints: Vector[][];
    occupiedPubkeyByBuildingIndex: Record<number, string>;
    spatialIndex?: OccupiedBuildingSpatialIndex;
}

export function findOccupiedBuildingHit({
    point,
    footprints,
    occupiedPubkeyByBuildingIndex,
    spatialIndex,
}: FindOccupiedBuildingHitInput): OccupiedBuildingHit | null {
    const candidateIndices = spatialIndex?.query(point)
        ?? Array.from({ length: footprints.length }, (_, index) => footprints.length - 1 - index);

    for (const i of candidateIndices) {
        const pubkey = occupiedPubkeyByBuildingIndex[i];
        if (!pubkey) {
            continue;
        }

        if (insidePolygon(point, footprints[i])) {
            return {
                index: i,
                pubkey,
            };
        }
    }

    return null;
}

function insidePolygon(point: Vector, polygon: Vector[]): boolean {
    if (polygon.length === 0) {
        return false;
    }

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}
