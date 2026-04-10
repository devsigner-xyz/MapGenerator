import Vector from '../vector';

export interface OccupiedBuildingHit {
    index: number;
    pubkey: string;
}

export interface BuildingHit {
    index: number;
}

interface FindBuildingHitInput {
    point: Vector;
    footprints: Vector[][];
}

interface FindOccupiedBuildingHitInput {
    point: Vector;
    footprints: Vector[][];
    occupiedPubkeyByBuildingIndex: Record<number, string>;
}

export function findBuildingHit({
    point,
    footprints,
}: FindBuildingHitInput): BuildingHit | null {
    for (let i = footprints.length - 1; i >= 0; i--) {
        if (insidePolygon(point, footprints[i])) {
            return { index: i };
        }
    }

    return null;
}

export function findOccupiedBuildingHit({
    point,
    footprints,
    occupiedPubkeyByBuildingIndex,
}: FindOccupiedBuildingHitInput): OccupiedBuildingHit | null {
    for (let i = footprints.length - 1; i >= 0; i--) {
        if (!insidePolygon(point, footprints[i])) {
            continue;
        }

        const pubkey = occupiedPubkeyByBuildingIndex[i];
        if (!pubkey) {
            continue;
        }

        return {
            index: i,
            pubkey,
        };
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
