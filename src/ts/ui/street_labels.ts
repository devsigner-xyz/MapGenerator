import Vector from '../vector';

export interface LabelNamePool {
    suffixes: string[];
    fallbackBases: string[];
}

export interface LabelNamePoolInput {
    suffixes?: string[];
    fallbackBases?: string[];
}

export interface MapLabel {
    text: string;
    anchor: Vector;
    angleRad: number;
    color?: string;
    fontScale?: number;
}

export type StreetLabel = MapLabel;

export interface MapLabelNamePool {
    street: LabelNamePool;
    water: LabelNamePool;
    park: LabelNamePool;
}

export interface MapLabelNamePoolInput {
    sharedFallbackBases?: string[];
    street?: LabelNamePoolInput;
    water?: LabelNamePoolInput;
    park?: LabelNamePoolInput;
}

export type StreetNamePool = LabelNamePool;

export interface BuildStreetNamesInput {
    usernames?: string[];
    desiredCount: number;
    seed?: string;
    pool?: LabelNamePool;
}

export interface CreateStreetLabelsInput {
    enabled: boolean;
    zoom: number;
    zoomThreshold: number;
    roads: Vector[][];
    parks?: Vector[][];
    usernames?: string[];
    seed?: string;
    pool?: LabelNamePool;
    minRoadLengthPx?: number;
    minLabelSpacingPx?: number;
    maxLabels?: number;
}

export interface CreateWaterLabelInput {
    polygon: Vector[];
    seed?: string;
    pool?: LabelNamePool;
}

export interface CreateBigParkLabelsInput {
    polygons: Vector[][];
    seed?: string;
    pool?: LabelNamePool;
}

const DEFAULT_SEED = 'street-labels';
const DEFAULT_MIN_ROAD_LENGTH_PX = 120;
const DEFAULT_MIN_LABEL_SPACING_PX = 110;
const DEFAULT_MAX_LABELS = 48;
const DEFAULT_SHARED_FALLBACK_BASES = ['Relay', 'Zap', 'NIP-03'];

const DEFAULT_STREET_NAME_POOL: LabelNamePool = {
    suffixes: ['Street', 'Avenue', 'Lane', 'Road', 'Boulevard', 'Way'],
    fallbackBases: DEFAULT_SHARED_FALLBACK_BASES,
};

const DEFAULT_WATER_NAME_POOL: LabelNamePool = {
    suffixes: ['Sea', 'Lake'],
    fallbackBases: DEFAULT_SHARED_FALLBACK_BASES,
};

const DEFAULT_PARK_NAME_POOL: LabelNamePool = {
    suffixes: ['Park', 'Garden'],
    fallbackBases: DEFAULT_SHARED_FALLBACK_BASES,
};

const DEFAULT_MAP_LABEL_NAME_POOL: MapLabelNamePool = {
    street: DEFAULT_STREET_NAME_POOL,
    water: DEFAULT_WATER_NAME_POOL,
    park: DEFAULT_PARK_NAME_POOL,
};

interface RoadPlacement {
    roadIndex: number;
    anchor: Vector;
    angleRad: number;
    length: number;
}

function normalizeLabelPart(value?: string): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : undefined;
}

function normalizeUniqueStrings(values: string[]): string[] {
    const normalizedValues: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        const normalized = normalizeLabelPart(value);
        if (!normalized) {
            continue;
        }

        const dedupeKey = normalized.toLocaleLowerCase();
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        normalizedValues.push(normalized);
    }

    return normalizedValues;
}

function capitalizeWord(word: string): string {
    const nipMatch = /^nip-(\d+)$/i.exec(word);
    if (nipMatch) {
        return `NIP-${nipMatch[1]}`;
    }

    if (!/[a-z]/i.test(word)) {
        return word;
    }

    const lower = word.toLocaleLowerCase();
    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}

function toCapitalizedLabel(value: string): string {
    return value
        .split(' ')
        .map((token) => {
            if (!token) {
                return token;
            }

            const nipTokenMatch = /^nip-(\d+)$/i.exec(token);
            if (nipTokenMatch) {
                return `NIP-${nipTokenMatch[1]}`;
            }

            if (!token.includes('-')) {
                return capitalizeWord(token);
            }

            const segments = token.split('-').map((segment) => capitalizeWord(segment));
            return segments.join('-');
        })
        .join(' ');
}

function fnv1aHash(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}

function deterministicSortBySeed(values: string[], seed: string, namespace: string): string[] {
    return values.slice().sort((left, right) => {
        const leftHash = fnv1aHash(`${seed}:${namespace}:${left}`);
        const rightHash = fnv1aHash(`${seed}:${namespace}:${right}`);
        if (leftHash === rightHash) {
            return left.localeCompare(right);
        }
        return leftHash - rightHash;
    });
}

function resolveSeed(seed?: string): string {
    const normalized = normalizeLabelPart(seed);
    return normalized || DEFAULT_SEED;
}

function normalizeLabelNamePool(
    pool: LabelNamePoolInput | undefined,
    defaults: LabelNamePool,
    sharedFallbackBases?: string[],
): LabelNamePool {
    const suffixes = normalizeUniqueStrings(pool?.suffixes || defaults.suffixes);
    const sourceFallbackBases = pool?.fallbackBases || sharedFallbackBases || defaults.fallbackBases;
    const fallbackBases = normalizeUniqueStrings(sourceFallbackBases);
    const defaultFallbackBases = sharedFallbackBases || defaults.fallbackBases;

    return {
        suffixes: suffixes.length > 0 ? suffixes : defaults.suffixes.slice(),
        fallbackBases: fallbackBases.length > 0 ? fallbackBases : defaultFallbackBases.slice(),
    };
}

export function normalizeStreetNamePool(pool?: LabelNamePool): LabelNamePool {
    return normalizeLabelNamePool(pool, DEFAULT_STREET_NAME_POOL);
}

export function normalizeMapLabelNamePool(pool?: MapLabelNamePoolInput): MapLabelNamePool {
    const sharedFallbackBases = normalizeUniqueStrings(pool?.sharedFallbackBases || []);
    const effectiveSharedFallbackBases = sharedFallbackBases.length > 0 ? sharedFallbackBases : undefined;

    return {
        street: normalizeLabelNamePool(pool?.street, DEFAULT_MAP_LABEL_NAME_POOL.street, effectiveSharedFallbackBases),
        water: normalizeLabelNamePool(pool?.water, DEFAULT_MAP_LABEL_NAME_POOL.water, effectiveSharedFallbackBases),
        park: normalizeLabelNamePool(pool?.park, DEFAULT_MAP_LABEL_NAME_POOL.park, effectiveSharedFallbackBases),
    };
}

function pickSuffix(input: {
    key: string;
    index: number;
    seed: string;
    suffixes: string[];
}): string {
    if (input.suffixes.length === 0) {
        return 'Street';
    }

    const suffixIndex = fnv1aHash(`${input.seed}:suffix:${input.key}:${input.index}`) % input.suffixes.length;
    return input.suffixes[suffixIndex] || 'Street';
}

export function buildStreetNames(input: BuildStreetNamesInput): string[] {
    const desiredCount = Math.max(0, Math.floor(input.desiredCount));
    if (desiredCount === 0) {
        return [];
    }

    const seed = resolveSeed(input.seed);
    const pool = normalizeStreetNamePool(input.pool);
    const usernames = normalizeUniqueStrings(input.usernames || []);

    const names: string[] = [];
    const seen = new Set<string>();
    const pushUnique = (value: string): void => {
        const dedupeKey = value.toLocaleLowerCase();
        if (seen.has(dedupeKey)) {
            return;
        }

        names.push(value);
        seen.add(dedupeKey);
    };

    for (let i = 0; i < usernames.length && names.length < desiredCount; i++) {
        const username = usernames[i];
        if (!username) {
            continue;
        }

        const suffix = pickSuffix({
            key: username,
            index: i,
            seed,
            suffixes: pool.suffixes,
        });
        pushUnique(`${toCapitalizedLabel(username)} ${toCapitalizedLabel(suffix)}`);
    }

    const orderedFallbackBases = deterministicSortBySeed(pool.fallbackBases, seed, 'fallback-base');
    let attempts = 0;
    while (names.length < desiredCount && attempts < desiredCount * 12) {
        const base = orderedFallbackBases[attempts % orderedFallbackBases.length] || 'Relay';
        const suffix = pickSuffix({
            key: base,
            index: usernames.length + attempts,
            seed,
            suffixes: pool.suffixes,
        });
        pushUnique(`${toCapitalizedLabel(base)} ${toCapitalizedLabel(suffix)}`);
        attempts += 1;
    }

    while (names.length < desiredCount) {
        const suffix = pickSuffix({
            key: `relay-${names.length}`,
            index: names.length,
            seed,
            suffixes: pool.suffixes,
        });
        pushUnique(`Relay ${toCapitalizedLabel(suffix)} ${names.length + 1}`);
    }

    return names;
}

export function normalizeTextAngle(angleRad: number): number {
    let angle = angleRad;
    const halfTurn = Math.PI;
    const maxAbs = Math.PI / 2;

    while (angle > maxAbs) {
        angle -= halfTurn;
    }

    while (angle <= -maxAbs) {
        angle += halfTurn;
    }

    return angle;
}

function measureRoadPlacement(road: Vector[], minRoadLengthPx: number, roadIndex: number): RoadPlacement | null {
    if (!road || road.length < 2) {
        return null;
    }

    let totalLength = 0;
    let longestSegmentLength = 0;
    let longestSegmentMidpoint: Vector | null = null;
    let longestSegmentAngle = 0;

    for (let i = 1; i < road.length; i++) {
        const previous = road[i - 1];
        const current = road[i];
        if (!previous || !current) {
            continue;
        }

        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        const segmentLength = Math.sqrt((dx * dx) + (dy * dy));

        if (segmentLength <= 0) {
            continue;
        }

        totalLength += segmentLength;
        if (segmentLength > longestSegmentLength) {
            longestSegmentLength = segmentLength;
            longestSegmentMidpoint = new Vector((previous.x + current.x) / 2, (previous.y + current.y) / 2);
            longestSegmentAngle = Math.atan2(dy, dx);
        }
    }

    if (!longestSegmentMidpoint || totalLength < minRoadLengthPx) {
        return null;
    }

    return {
        roadIndex,
        anchor: longestSegmentMidpoint,
        angleRad: normalizeTextAngle(longestSegmentAngle),
        length: totalLength,
    };
}

function averagePoint(polygon: Vector[]): Vector {
    if (polygon.length === 0) {
        return Vector.zeroVector();
    }

    const sum = Vector.zeroVector();
    for (const point of polygon) {
        sum.add(point);
    }

    return sum.divideScalar(polygon.length);
}

function pointInsidePolygon(point: Vector, polygon: Vector[]): boolean {
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

        const intersects = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function isAnchorInsideAnyPark(anchor: Vector, parks: Vector[][]): boolean {
    if (parks.length === 0) {
        return false;
    }

    return parks.some((polygon) => pointInsidePolygon(anchor, polygon));
}

export function createStreetLabels(input: CreateStreetLabelsInput): StreetLabel[] {
    if (!input.enabled || !Number.isFinite(input.zoom) || input.zoom < input.zoomThreshold) {
        return [];
    }

    const zoomThreshold = Math.max(1, input.zoomThreshold);
    const zoomStabilityScale = input.zoom / zoomThreshold;
    const minRoadLengthPx = Math.max(1, (input.minRoadLengthPx || DEFAULT_MIN_ROAD_LENGTH_PX) * zoomStabilityScale);
    const minLabelSpacingPx = Math.max(1, (input.minLabelSpacingPx || DEFAULT_MIN_LABEL_SPACING_PX) * zoomStabilityScale);
    const maxLabels = Math.max(1, Math.floor(input.maxLabels || DEFAULT_MAX_LABELS));
    const parks = input.parks || [];
    const namesInput: BuildStreetNamesInput = {
        usernames: input.usernames || [],
        desiredCount: input.roads.length,
        seed: resolveSeed(input.seed),
    };
    if (input.pool) {
        namesInput.pool = input.pool;
    }

    const namesByRoadIndex = buildStreetNames(namesInput);

    const candidates: RoadPlacement[] = [];
    for (let roadIndex = 0; roadIndex < input.roads.length; roadIndex++) {
        const road = input.roads[roadIndex];
        if (!road) {
            continue;
        }

        const placement = measureRoadPlacement(road, minRoadLengthPx, roadIndex);
        if (!placement) {
            continue;
        }
        if (isAnchorInsideAnyPark(placement.anchor, parks)) {
            continue;
        }
        candidates.push(placement);
    }

    if (candidates.length === 0) {
        return [];
    }

    candidates.sort((left, right) => right.length - left.length);

    const acceptedPlacements: RoadPlacement[] = [];
    const minDistanceSq = minLabelSpacingPx * minLabelSpacingPx;

    for (const candidate of candidates) {
        if (acceptedPlacements.length >= maxLabels) {
            break;
        }

        const intersectsExisting = acceptedPlacements.some((existing) => existing.anchor.distanceToSquared(candidate.anchor) < minDistanceSq);
        if (intersectsExisting) {
            continue;
        }

        acceptedPlacements.push(candidate);
    }

    return acceptedPlacements.map((placement, index) => ({
        text: namesByRoadIndex[placement.roadIndex] || `Relay Street ${placement.roadIndex + 1}`,
        anchor: placement.anchor,
        angleRad: placement.angleRad,
    }));
}

function createAreaLabel(input: {
    polygon: Vector[];
    seed?: string;
    pool?: LabelNamePool;
    namespace: string;
}): MapLabel | null {
    if (!input.polygon || input.polygon.length < 3) {
        return null;
    }

    const namesInput: BuildStreetNamesInput = {
        desiredCount: 1,
        seed: `${resolveSeed(input.seed)}:${input.namespace}`,
    };
    if (input.pool) {
        namesInput.pool = input.pool;
    }

    const names = buildStreetNames(namesInput);

    const text = names[0];
    if (!text) {
        return null;
    }

    return {
        text,
        anchor: averagePoint(input.polygon),
        angleRad: 0,
    };
}

export function createWaterLabel(input: CreateWaterLabelInput): MapLabel | null {
    const waterInput: {
        polygon: Vector[];
        seed?: string;
        pool?: LabelNamePool;
        namespace: string;
    } = {
        polygon: input.polygon,
        namespace: 'water',
    };
    if (input.seed) {
        waterInput.seed = input.seed;
    }
    if (input.pool) {
        waterInput.pool = input.pool;
    }

    return createAreaLabel(waterInput);
}

export function createBigParkLabels(input: CreateBigParkLabelsInput): MapLabel[] {
    const validPolygons = (input.polygons || []).filter((polygon) => polygon.length >= 3);
    if (validPolygons.length === 0) {
        return [];
    }

    const namesInput: BuildStreetNamesInput = {
        desiredCount: validPolygons.length,
        seed: `${resolveSeed(input.seed)}:parks`,
    };
    if (input.pool) {
        namesInput.pool = input.pool;
    }

    const names = buildStreetNames(namesInput);

    return validPolygons.map((polygon, index) => ({
        text: names[index] || `Park ${index + 1}`,
        anchor: averagePoint(polygon),
        angleRad: 0,
    }));
}
