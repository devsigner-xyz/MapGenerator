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
        const footprint = footprints[i];
        if (!footprint) {
            continue;
        }

        if (insidePolygon(point, footprint)) {
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
        const footprint = footprints[i];
        if (!footprint || !insidePolygon(point, footprint)) {
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
        const pointI = polygon[i];
        const pointJ = polygon[j];
        if (!pointI || !pointJ) {
            continue;
        }

        const xi = pointI.x;
        const yi = pointI.y;
        const xj = pointJ.x;
        const yj = pointJ.y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}
