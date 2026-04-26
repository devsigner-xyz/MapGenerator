import { describe, expect, test, vi } from 'vitest';
import Vector from '../vector';
import { runMapGeneration } from './map_generation_runner';

describe('runMapGeneration', () => {
    test('uses zoom-independent base bounds when targetBuildings is absent', async () => {
        const setRecommended = vi.fn();
        const generateEverything = vi.fn(async () => undefined);
        const getBuildingCentroidsWorld = vi.fn(() => Array.from({ length: 12 }, (_, index) => new Vector(index, index)));

        await runMapGeneration({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            tensorField: { setRecommended } as never,
            mainGui: { generateEverything, getBuildingCentroidsWorld } as never,
        });

        const firstBounds = setRecommended.mock.calls[0]?.[0];
        expect(firstBounds.worldDimensions).toEqual(new Vector(1200, 800));
        expect(generateEverything).toHaveBeenCalledWith(firstBounds);
    });

    test('normalizes invalid targetBuildings to the base sizing path', async () => {
        const setRecommended = vi.fn();
        const generateEverything = vi.fn(async () => undefined);
        const getBuildingCentroidsWorld = vi.fn(() => Array.from({ length: 12 }, (_, index) => new Vector(index, index)));

        await runMapGeneration({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: Number.NaN,
            tensorField: { setRecommended } as never,
            mainGui: { generateEverything, getBuildingCentroidsWorld } as never,
        });

        expect(setRecommended.mock.calls[0]?.[0].worldDimensions).toEqual(new Vector(1200, 800));
    });

    test('calibrates target-driven generation until it lands inside the acceptance band', async () => {
        const counts = [40, 100];
        const setRecommended = vi.fn();
        const generateEverything = vi.fn(async () => undefined);
        const getBuildingCentroidsWorld = vi.fn(() => Array.from({ length: counts.shift() ?? 0 }, (_, index) => new Vector(index, index)));

        const result = await runMapGeneration({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 100,
            tensorField: { setRecommended } as never,
            mainGui: { generateEverything, getBuildingCentroidsWorld } as never,
        });

        expect(setRecommended).toHaveBeenCalledTimes(2);
        expect(generateEverything).toHaveBeenCalledTimes(2);
        expect(result.actualBuildings).toBe(100);
    });

    test('announces each target-driven attempt bounds before generating the attempt', async () => {
        const counts = [40, 100];
        const events: string[] = [];
        const setRecommended = vi.fn();
        const onAttemptBoundsResolved = vi.fn((bounds) => {
            events.push(`fit:${bounds.worldDimensions.x}`);
        });
        const generateEverything = vi.fn(async (bounds) => {
            events.push(`generate:${bounds.worldDimensions.x}`);
        });
        const getBuildingCentroidsWorld = vi.fn(() => Array.from({ length: counts.shift() ?? 0 }, (_, index) => new Vector(index, index)));

        await runMapGeneration({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 100,
            tensorField: { setRecommended } as never,
            mainGui: { generateEverything, getBuildingCentroidsWorld } as never,
            onAttemptBoundsResolved,
        });

        expect(onAttemptBoundsResolved).toHaveBeenCalledTimes(2);
        expect(events).toHaveLength(4);
        const [firstFit, firstGenerate, secondFit, secondGenerate] = events as [string, string, string, string];
        expect(firstFit).toMatch(/^fit:/);
        expect(firstGenerate).toBe(firstFit.replace('fit:', 'generate:'));
        expect(secondFit).toMatch(/^fit:/);
        expect(secondGenerate).toBe(secondFit.replace('fit:', 'generate:'));
    });

    test('replays the best attempt when calibration misses the band and returns the visible replay count', async () => {
        const counts = [130, 50, 125];
        const setRecommended = vi.fn();
        const generateEverything = vi.fn(async () => undefined);
        const getBuildingCentroidsWorld = vi.fn(() => Array.from({ length: counts.shift() ?? 0 }, (_, index) => new Vector(index, index)));

        const result = await runMapGeneration({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 100,
            tensorField: { setRecommended } as never,
            mainGui: { generateEverything, getBuildingCentroidsWorld } as never,
            maxAttempts: 2,
        });

        expect(setRecommended).toHaveBeenCalledTimes(3);
        expect(generateEverything).toHaveBeenCalledTimes(3);
        expect(setRecommended.mock.calls[2]?.[0]).toEqual(setRecommended.mock.calls[0]?.[0]);
        expect(result.actualBuildings).toBe(125);
    });

    test('prefers a non-deficit attempt over a closer deficit attempt when target is missed', async () => {
        const counts = [370, 881, 881];
        const setRecommended = vi.fn();
        const generateEverything = vi.fn(async () => undefined);
        const getBuildingCentroidsWorld = vi.fn(() => Array.from({ length: counts.shift() ?? 0 }, (_, index) => new Vector(index, index)));

        const result = await runMapGeneration({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 600,
            tensorField: { setRecommended } as never,
            mainGui: { generateEverything, getBuildingCentroidsWorld } as never,
            maxAttempts: 2,
        });

        expect(setRecommended).toHaveBeenCalledTimes(2);
        expect(result.actualBuildings).toBe(881);
    });

    test('prefers a small deficit over an extreme overshoot when neither attempt lands in band', async () => {
        const counts = [52646, 583];
        const setRecommended = vi.fn();
        const generateEverything = vi.fn(async () => undefined);
        const getBuildingCentroidsWorld = vi.fn(() => Array.from({ length: counts.shift() ?? 0 }, (_, index) => new Vector(index, index)));

        const result = await runMapGeneration({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 600,
            tensorField: { setRecommended } as never,
            mainGui: { generateEverything, getBuildingCentroidsWorld } as never,
            maxAttempts: 2,
        });

        expect(result.actualBuildings).toBe(583);
    });

    test('never chooses an overshoot above 10000 buildings as the best result when a smaller attempt exists', async () => {
        const counts = [25000, 1800];
        const setRecommended = vi.fn();
        const generateEverything = vi.fn(async () => undefined);
        const getBuildingCentroidsWorld = vi.fn(() => Array.from({ length: counts.shift() ?? 0 }, (_, index) => new Vector(index, index)));

        const result = await runMapGeneration({
            viewCenter: new Vector(500, 400),
            screenDimensions: new Vector(1200, 800),
            targetBuildings: 2000,
            tensorField: { setRecommended } as never,
            mainGui: { generateEverything, getBuildingCentroidsWorld } as never,
            maxAttempts: 2,
        });

        expect(result.actualBuildings).toBe(1800);
    });
});
