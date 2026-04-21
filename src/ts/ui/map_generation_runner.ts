import {
    buildAcceptanceBand,
    resolveInitialGenerationBounds,
    retuneGenerationBounds,
    type GenerationBounds,
    normalizeTargetBuildings,
} from './map_generation_context';
import Vector from '../vector';

interface MapGenerationTensorFieldLike {
    setRecommended(bounds: GenerationBounds): void;
}

interface MapGenerationMainGuiLike {
    generateEverything(bounds: GenerationBounds): Promise<void>;
    getBuildingCentroidsWorld(): Vector[];
}

function scoreAttempt(actualBuildings: number, targetBuildings: number): number {
    const distance = Math.abs(targetBuildings - actualBuildings);
    return actualBuildings >= targetBuildings ? distance : distance * 10;
}

export async function runMapGeneration(input: {
    viewCenter: Vector;
    screenDimensions: Vector;
    targetBuildings?: number;
    tensorField: MapGenerationTensorFieldLike;
    mainGui: MapGenerationMainGuiLike;
    maxAttempts?: number;
}): Promise<{ bounds: GenerationBounds; actualBuildings: number; accepted: boolean }> {
    const normalizedTarget = normalizeTargetBuildings(input.targetBuildings);
    let bounds = resolveInitialGenerationBounds({
        viewCenter: input.viewCenter,
        screenDimensions: input.screenDimensions,
        ...(normalizedTarget === undefined ? {} : { targetBuildings: normalizedTarget }),
    });

    if (normalizedTarget === undefined) {
        input.tensorField.setRecommended(bounds);
        await input.mainGui.generateEverything(bounds);
        return {
            bounds,
            actualBuildings: input.mainGui.getBuildingCentroidsWorld().length,
            accepted: true,
        };
    }

    const band = buildAcceptanceBand(normalizedTarget);
    const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? 6));
    let bestResult: { bounds: GenerationBounds; actualBuildings: number; accepted: boolean } | null = null;
    let lastCompletedResult: { bounds: GenerationBounds; actualBuildings: number; accepted: boolean } | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        input.tensorField.setRecommended(bounds);
        await input.mainGui.generateEverything(bounds);
        const actualBuildings = input.mainGui.getBuildingCentroidsWorld().length;
        const accepted = actualBuildings >= band.min && actualBuildings <= band.max;
        const result = { bounds, actualBuildings, accepted };
        lastCompletedResult = result;

        if (!bestResult
            || scoreAttempt(actualBuildings, normalizedTarget) < scoreAttempt(bestResult.actualBuildings, normalizedTarget)
            || (
                scoreAttempt(actualBuildings, normalizedTarget) === scoreAttempt(bestResult.actualBuildings, normalizedTarget)
                && actualBuildings >= normalizedTarget
                && bestResult.actualBuildings < normalizedTarget
            )) {
            bestResult = result;
        }

        if (accepted) {
            return result;
        }

        bounds = retuneGenerationBounds({
            bounds,
            targetBuildings: normalizedTarget,
            actualBuildings,
        });
    }

    if (bestResult && lastCompletedResult && bestResult.bounds !== lastCompletedResult.bounds) {
        input.tensorField.setRecommended(bestResult.bounds);
        await input.mainGui.generateEverything(bestResult.bounds);
        return {
            bounds: bestResult.bounds,
            actualBuildings: input.mainGui.getBuildingCentroidsWorld().length,
            accepted: false,
        };
    }

    return bestResult ?? {
        bounds,
        actualBuildings: 0,
        accepted: false,
    };
}
