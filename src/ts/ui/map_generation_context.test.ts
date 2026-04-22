import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import {
    buildAcceptanceBand,
    inflateGenerationBounds,
    resolveInitialGenerationBounds,
    retuneGenerationBounds,
    runGenerationCalibration,
} from './map_generation_context';

describe('map_generation_context', () => {
    test('resolveInitialGenerationBounds uses the screen dimensions baseline when targetBuildings is absent', () => {
        const bounds = resolveInitialGenerationBounds({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
        });

        expect(bounds.worldDimensions).toEqual(new Vector(1200, 800));
        expect(bounds.origin).toEqual(new Vector(-100, 0));
    });

    test('resolveInitialGenerationBounds uses a smaller initial world for very small explicit targets', () => {
        const largerBounds = resolveInitialGenerationBounds({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 600,
        });
        const bounds = resolveInitialGenerationBounds({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 64,
        });

        expect(bounds.worldDimensions.x).toBeLessThan(largerBounds.worldDimensions.x);
        expect(bounds.worldDimensions.y).toBeLessThan(largerBounds.worldDimensions.y);
    });

    test('resolveInitialGenerationBounds scales above the 600-building sizing for larger targets', () => {
        const smallerBounds = resolveInitialGenerationBounds({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 600,
        });
        const bounds = resolveInitialGenerationBounds({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 2000,
        });

        expect(bounds.worldDimensions.x).toBeGreaterThan(smallerBounds.worldDimensions.x);
        expect(bounds.worldDimensions.y).toBeGreaterThan(smallerBounds.worldDimensions.y);
    });

    test('resolveInitialGenerationBounds starts below the baseline for a 600-building target', () => {
        const bounds = resolveInitialGenerationBounds({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 600,
        });

        expect(bounds.worldDimensions.x).toBeLessThan(1200);
        expect(bounds.worldDimensions.y).toBeLessThan(800);
    });

    test('normalizeTargetBuildings caps very large targets at 10000', () => {
        expect(resolveInitialGenerationBounds({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 10000,
        }).worldDimensions).toEqual(resolveInitialGenerationBounds({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 50000,
        }).worldDimensions);
    });

    test('inflateGenerationBounds expands dimensions without changing the center', () => {
        const inflated = inflateGenerationBounds({
            origin: new Vector(100, 200),
            worldDimensions: new Vector(300, 150),
        });

        expect(inflated.worldDimensions).toEqual(new Vector(360, 180));
        expect(inflated.origin).toEqual(new Vector(70, 185));
    });

    test('buildAcceptanceBand returns the exact target lower bound and 20 percent upper bound', () => {
        expect(buildAcceptanceBand(100)).toEqual({ min: 100, max: 120 });
        expect(buildAcceptanceBand(10)).toEqual({ min: 10, max: 16 });
        expect(buildAcceptanceBand(10000)).toEqual({ min: 10000, max: 10000 });
    });

    test('retuneGenerationBounds guards against zero actual buildings', () => {
        const retuned = retuneGenerationBounds({
            bounds: {
                origin: new Vector(100, 200),
                worldDimensions: new Vector(300, 150),
            },
            targetBuildings: 64,
            actualBuildings: 0,
        });

        expect(retuned.worldDimensions.x).toBeGreaterThan(300);
        expect(retuned.worldDimensions.y).toBeGreaterThan(150);
    });

    test('runGenerationCalibration stops on the first in-band attempt', () => {
        const attempts: number[] = [];
        const result = runGenerationCalibration({
            initialBounds: {
                origin: new Vector(0, 0),
                worldDimensions: new Vector(1200, 800),
            },
            targetBuildings: 100,
            measure: (bounds) => {
                attempts.push(bounds.worldDimensions.x);
                return attempts.length === 1 ? 100 : 20;
            },
        });

        expect(attempts).toHaveLength(1);
        expect(result.actualBuildings).toBe(100);
    });

    test('runGenerationCalibration keeps the closest non-deficit attempt on ties', () => {
        const result = runGenerationCalibration({
            initialBounds: {
                origin: new Vector(0, 0),
                worldDimensions: new Vector(1200, 800),
            },
            targetBuildings: 100,
            measure: () => 0,
            maxAttempts: 2,
            attemptsOverride: [80, 120],
        });

        expect(result.actualBuildings).toBe(120);
    });
});
