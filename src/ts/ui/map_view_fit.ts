import Vector from '../vector';

interface GeneratedMapCoverViewInput {
    screenDimensions: Vector;
    footprints: Vector[][];
    centroids: Vector[];
}

interface WorldBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export interface GeneratedMapCoverView {
    center: Vector;
    zoom: number;
}

const COVER_OVERSCAN = 1.02;
const MIN_WORLD_SPAN = 1;

function accumulatePointBounds(bounds: WorldBounds | null, point: Vector): WorldBounds {
    if (!bounds) {
        return {
            minX: point.x,
            maxX: point.x,
            minY: point.y,
            maxY: point.y,
        };
    }

    return {
        minX: Math.min(bounds.minX, point.x),
        maxX: Math.max(bounds.maxX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxY: Math.max(bounds.maxY, point.y),
    };
}

function getFootprintBounds(footprints: Vector[][]): WorldBounds | null {
    let bounds: WorldBounds | null = null;
    for (const footprint of footprints) {
        for (const point of footprint) {
            bounds = accumulatePointBounds(bounds, point);
        }
    }
    return bounds;
}

function getCentroidBounds(centroids: Vector[]): WorldBounds | null {
    let bounds: WorldBounds | null = null;
    for (const point of centroids) {
        bounds = accumulatePointBounds(bounds, point);
    }
    return bounds;
}

export function calculateGeneratedMapCoverView(input: GeneratedMapCoverViewInput): GeneratedMapCoverView | null {
    const bounds = getFootprintBounds(input.footprints) ?? getCentroidBounds(input.centroids);
    if (!bounds) {
        return null;
    }

    const width = Math.max(MIN_WORLD_SPAN, bounds.maxX - bounds.minX);
    const height = Math.max(MIN_WORLD_SPAN, bounds.maxY - bounds.minY);
    const center = new Vector(
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
    );
    const zoom = Math.max(
        input.screenDimensions.x / width,
        input.screenDimensions.y / height,
    ) * COVER_OVERSCAN;

    return { center, zoom };
}
