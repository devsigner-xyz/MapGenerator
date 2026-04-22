import Util from '../util';
import Vector from '../vector';

export interface GenerationBounds {
    origin: Vector;
    worldDimensions: Vector;
}

export interface GenerationAcceptanceBand {
    min: number;
    max: number;
}

export interface GenerationCalibrationResult {
    bounds: GenerationBounds;
    actualBuildings: number;
    accepted: boolean;
}

const BASE_TARGET_BUILDINGS = 600;
const MIN_TARGET_BUILDINGS = 24;
const MAX_TARGET_BUILDINGS = 10000;
const TARGETED_BASE_WORLD_SCALE = 0.33;

export function normalizeTargetBuildings(targetBuildings?: number): number | undefined {
    if (!Number.isFinite(targetBuildings)) {
        return undefined;
    }

    const normalized = Math.floor(targetBuildings as number);
    if (normalized <= 0) {
        return undefined;
    }

    return Math.min(MAX_TARGET_BUILDINGS, Math.max(MIN_TARGET_BUILDINGS, normalized));
}

function centerOf(bounds: GenerationBounds): Vector {
    return bounds.origin.clone().add(bounds.worldDimensions.clone().divideScalar(2));
}

export function resolveInitialGenerationBounds(input: {
    viewCenter: Vector;
    screenDimensions: Vector;
    targetBuildings?: number;
}): GenerationBounds {
    const normalizedTarget = normalizeTargetBuildings(input.targetBuildings);
    const baseWorldDimensions = normalizedTarget === undefined
        ? input.screenDimensions.clone()
        : input.screenDimensions.clone().multiplyScalar(TARGETED_BASE_WORLD_SCALE);
    const worldDimensions = normalizedTarget === undefined
        ? baseWorldDimensions
        : baseWorldDimensions.multiplyScalar(Math.sqrt(normalizedTarget / BASE_TARGET_BUILDINGS));

    return {
        origin: input.viewCenter.clone().sub(worldDimensions.clone().divideScalar(2)),
        worldDimensions,
    };
}

export function inflateGenerationBounds(bounds: GenerationBounds): GenerationBounds {
    const center = centerOf(bounds);
    const worldDimensions = bounds.worldDimensions.clone().multiplyScalar(Util.DRAW_INFLATE_AMOUNT);
    return {
        origin: center.sub(worldDimensions.clone().divideScalar(2)),
        worldDimensions,
    };
}

export function buildAcceptanceBand(targetBuildings: number): GenerationAcceptanceBand {
    return {
        min: targetBuildings,
        max: Math.min(MAX_TARGET_BUILDINGS, targetBuildings + Math.max(6, Math.ceil(targetBuildings * 0.2))),
    };
}

export function calculatePathIterations(worldDimensions: Vector, dstep: number): number {
    return (1.5 * Math.max(worldDimensions.x, worldDimensions.y)) / dstep;
}

export function retuneGenerationBounds(input: {
    bounds: GenerationBounds;
    targetBuildings: number;
    actualBuildings: number;
}): GenerationBounds {
    const currentCenter = centerOf(input.bounds);
    const errorRatio = input.targetBuildings / Math.max(1, input.actualBuildings);
    const nextScale = Math.sqrt(errorRatio);
    const worldDimensions = input.bounds.worldDimensions.clone().multiplyScalar(nextScale);

    return {
        origin: currentCenter.sub(worldDimensions.clone().divideScalar(2)),
        worldDimensions,
    };
}

function scoreAttempt(actualBuildings: number, targetBuildings: number): { distance: number; deficit: boolean } {
    return {
        distance: Math.abs(targetBuildings - actualBuildings),
        deficit: actualBuildings < targetBuildings,
    };
}

function isBetterAttempt(candidate: GenerationCalibrationResult, best: GenerationCalibrationResult, targetBuildings: number): boolean {
    const candidateScore = scoreAttempt(candidate.actualBuildings, targetBuildings);
    const bestScore = scoreAttempt(best.actualBuildings, targetBuildings);

    if (candidateScore.distance !== bestScore.distance) {
        return candidateScore.distance < bestScore.distance;
    }

    return bestScore.deficit && !candidateScore.deficit;
}

export function runGenerationCalibration(input: {
    initialBounds: GenerationBounds;
    targetBuildings: number;
    measure: (bounds: GenerationBounds) => number;
    maxAttempts?: number;
    attemptsOverride?: number[];
}): GenerationCalibrationResult {
    const band = buildAcceptanceBand(input.targetBuildings);
    const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? 4));
    let bounds = input.initialBounds;
    let bestAttempt: GenerationCalibrationResult | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const actualBuildings = input.attemptsOverride?.[attempt] ?? input.measure(bounds);
        const attemptResult: GenerationCalibrationResult = {
            bounds,
            actualBuildings,
            accepted: actualBuildings >= band.min && actualBuildings <= band.max,
        };

        if (!bestAttempt || isBetterAttempt(attemptResult, bestAttempt, input.targetBuildings)) {
            bestAttempt = attemptResult;
        }

        if (attemptResult.accepted) {
            return attemptResult;
        }

        bounds = retuneGenerationBounds({
            bounds,
            targetBuildings: input.targetBuildings,
            actualBuildings,
        });
    }

    return bestAttempt ?? {
        bounds: input.initialBounds,
        actualBuildings: 0,
        accepted: false,
    };
}
