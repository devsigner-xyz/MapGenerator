import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import {
    buildStreetNames,
    createBigParkLabels,
    createStreetLabels,
    createWaterLabel,
    normalizeMapLabelNamePool,
    normalizeTextAngle,
} from './street_labels';

const POOL = normalizeMapLabelNamePool({
    street: {
        suffixes: ['Street', 'Avenue', 'Lane', 'Road', 'Boulevard', 'Way'],
        fallbackBases: ['Relay', 'Zap', 'NIP-03'],
    },
    water: {
        suffixes: ['Sea', 'Lake'],
        fallbackBases: ['Blue', 'Atlantic'],
    },
    park: {
        suffixes: ['Park', 'Garden'],
        fallbackBases: ['Central', 'Green'],
    },
});

function scaleRoads(roads: Vector[][], factor: number): Vector[][] {
    return roads.map((road) => road.map((point) => point.clone().multiplyScalar(factor)));
}

describe('street_labels', () => {
    test('normalizacion del pool generico conserva categorias y strings unicos', () => {
        const normalizedPool = normalizeMapLabelNamePool({
            street: { suffixes: ['Street'], fallbackBases: ['Relay'] },
            water: { suffixes: ['Sea', 'Lake'], fallbackBases: ['Atlantic'] },
            park: { suffixes: ['Park', 'Garden'], fallbackBases: ['Central'] },
        });

        expect(normalizedPool.water.suffixes).toEqual(['Sea', 'Lake']);
        expect(normalizedPool.park.suffixes).toEqual(['Park', 'Garden']);
    });

    test('normalizacion permite una sola lista fallback compartida', () => {
        const normalizedPool = normalizeMapLabelNamePool({
            sharedFallbackBases: ['Relay', 'Client'],
            street: { suffixes: ['Street'] },
            water: { suffixes: ['Sea', 'Lake'] },
            park: { suffixes: ['Park', 'Garden'] },
        });

        expect(normalizedPool.street.fallbackBases).toEqual(['Relay', 'Client']);
        expect(normalizedPool.water.fallbackBases).toEqual(['Relay', 'Client']);
        expect(normalizedPool.park.fallbackBases).toEqual(['Relay', 'Client']);
    });

    test('default map pools use english suffixes for water and parks', () => {
        const normalizedPool = normalizeMapLabelNamePool({});

        expect(normalizedPool.water.suffixes).toEqual(['Sea', 'Lake']);
        expect(normalizedPool.park.suffixes).toEqual(['Park', 'Garden']);
    });

    test('buildStreetNames prioritizes usernames and falls back to pool', () => {
        const names = buildStreetNames({
            usernames: ['alice'],
            desiredCount: 3,
            seed: 'seed-1',
            pool: POOL.street,
        });

        expect(names).toHaveLength(3);
        expect(names[0]).toMatch(/^Alice\s(Street|Avenue|Lane|Road|Boulevard|Way)$/);
        expect(names[1]).toMatch(/(Relay|Zap|NIP-03)/);
        expect(names[2]).toMatch(/(Relay|Zap|NIP-03)/);
    });

    test('buildStreetNames is deterministic for same seed and inputs', () => {
        const first = buildStreetNames({
            usernames: ['alice', 'bob'],
            desiredCount: 6,
            seed: 'seed-stable',
            pool: POOL.street,
        });
        const second = buildStreetNames({
            usernames: ['alice', 'bob'],
            desiredCount: 6,
            seed: 'seed-stable',
            pool: POOL.street,
        });

        expect(first).toEqual(second);
    });

    test('buildStreetNames capitalizes labels and avoids full uppercase output', () => {
        const names = buildStreetNames({
            usernames: ['ALICE WONDER'],
            desiredCount: 2,
            seed: 'caps-seed',
            pool: {
                suffixes: ['STREET'],
                fallbackBases: ['RELAY'],
            },
        });

        expect(names[0]).toBe('Alice Wonder Street');
        expect(names[1]).toBe('Relay Street');
        expect(names.every((name) => name !== name.toUpperCase())).toBe(true);
    });

    test('normalizeTextAngle keeps text upright', () => {
        const angle = normalizeTextAngle(Math.PI * 0.9);
        expect(angle).toBeLessThanOrEqual(Math.PI / 2);
        expect(angle).toBeGreaterThanOrEqual(-Math.PI / 2);
    });

    test('createStreetLabels returns empty when disabled or zoom is below threshold', () => {
        const roads = [[new Vector(0, 0), new Vector(220, 0)]];

        expect(createStreetLabels({
            enabled: false,
            zoom: 12,
            zoomThreshold: 10,
            roads,
            pool: POOL.street,
        })).toEqual([]);

        expect(createStreetLabels({
            enabled: true,
            zoom: 9,
            zoomThreshold: 10,
            roads,
            pool: POOL.street,
        })).toEqual([]);
    });

    test('createStreetLabels creates longitudinal labels when enabled and zoom threshold met', () => {
        const labels = createStreetLabels({
            enabled: true,
            zoom: 12,
            zoomThreshold: 10,
            roads: [
                [new Vector(0, 0), new Vector(300, 0)],
                [new Vector(0, 150), new Vector(200, 250)],
            ],
            usernames: ['alice'],
            seed: 'city-seed',
            pool: POOL.street,
            minRoadLengthPx: 100,
        });

        expect(labels.length).toBeGreaterThan(0);
        const firstLabel = labels[0];
        expect(firstLabel).toBeDefined();
        if (!firstLabel) {
            return;
        }

        expect(firstLabel.text).toMatch(/^Alice\s/);
        expect(firstLabel.angleRad).toBeCloseTo(0, 5);
    });

    test('createStreetLabels enforces spacing to avoid dense overlap', () => {
        const labels = createStreetLabels({
            enabled: true,
            zoom: 12,
            zoomThreshold: 10,
            roads: [
                [new Vector(0, 0), new Vector(300, 0)],
                [new Vector(0, 20), new Vector(300, 20)],
                [new Vector(0, 40), new Vector(300, 40)],
            ],
            seed: 'spacing-seed',
            pool: POOL.street,
            minRoadLengthPx: 100,
            minLabelSpacingPx: 120,
        });

        expect(labels.length).toBe(1);
    });

    test('street names stay stable for already-visible streets when zoom changes', () => {
        const baseRoads = [
            [new Vector(0, 0), new Vector(300, 0)],
            [new Vector(0, 50), new Vector(260, 50)],
            [new Vector(0, 220), new Vector(220, 220)],
        ];

        const labelsLowZoom = createStreetLabels({
            enabled: true,
            zoom: 10,
            zoomThreshold: 10,
            roads: scaleRoads(baseRoads, 1),
            seed: 'stable-name-seed',
            pool: POOL.street,
            minRoadLengthPx: 100,
            minLabelSpacingPx: 120,
        });

        const labelsHighZoom = createStreetLabels({
            enabled: true,
            zoom: 14,
            zoomThreshold: 10,
            roads: scaleRoads(baseRoads, 3),
            seed: 'stable-name-seed',
            pool: POOL.street,
            minRoadLengthPx: 100,
            minLabelSpacingPx: 120,
        });

        expect(labelsLowZoom.length).toBeGreaterThan(0);
        expect(labelsHighZoom.length).toBeGreaterThan(0);
        const lowFirst = labelsLowZoom[0];
        const highFirst = labelsHighZoom[0];
        if (!lowFirst || !highFirst) {
            return;
        }

        const lowFarRoad = labelsLowZoom.reduce((best, current) => (current.anchor.y > best.anchor.y ? current : best), lowFirst);
        const highFarRoad = labelsHighZoom.reduce((best, current) => (current.anchor.y > best.anchor.y ? current : best), highFirst);

        expect(lowFarRoad.text).toBe(highFarRoad.text);
    });

    test('already visible labels remain stable when zoom increases and label cap applies', () => {
        const baseRoads = [
            [new Vector(0, 0), new Vector(300, 0)],
            [new Vector(0, 90), new Vector(290, 90)],
            [new Vector(0, 220), new Vector(280, 220)],
        ];

        const labelsAtThreshold = createStreetLabels({
            enabled: true,
            zoom: 10,
            zoomThreshold: 10,
            roads: scaleRoads(baseRoads, 1),
            seed: 'stable-cap-seed',
            pool: POOL.street,
            minRoadLengthPx: 100,
            minLabelSpacingPx: 120,
            maxLabels: 2,
        });

        const labelsAfterZoomIn = createStreetLabels({
            enabled: true,
            zoom: 14,
            zoomThreshold: 10,
            roads: scaleRoads(baseRoads, 1.4),
            seed: 'stable-cap-seed',
            pool: POOL.street,
            minRoadLengthPx: 100,
            minLabelSpacingPx: 120,
            maxLabels: 2,
        });

        expect(labelsAtThreshold.map((label) => label.text)).toEqual(
            labelsAfterZoomIn.map((label) => label.text)
        );
    });

    test('createStreetLabels excludes labels inside parks', () => {
        const labels = createStreetLabels({
            enabled: true,
            zoom: 12,
            zoomThreshold: 10,
            roads: [[new Vector(20, 20), new Vector(220, 20)]],
            parks: [[new Vector(0, 0), new Vector(260, 0), new Vector(260, 80), new Vector(0, 80)]],
            pool: POOL.street,
            minRoadLengthPx: 100,
        });

        expect(labels).toEqual([]);
    });

    test('createWaterLabel creates deterministic water label', () => {
        const waterLabel = createWaterLabel({
            polygon: [new Vector(0, 0), new Vector(200, 0), new Vector(200, 120), new Vector(0, 120)],
            seed: 'seed-city',
            pool: POOL.water,
        });

        expect(waterLabel?.text).toMatch(/(Sea|Lake)$/);
    });

    test('createBigParkLabels creates one label per big park', () => {
        const parkLabels = createBigParkLabels({
            polygons: [
                [new Vector(0, 0), new Vector(180, 0), new Vector(180, 180), new Vector(0, 180)],
                [new Vector(220, 0), new Vector(420, 0), new Vector(420, 220), new Vector(220, 220)],
            ],
            seed: 'seed-city',
            pool: POOL.park,
        });

        expect(parkLabels).toHaveLength(2);
        const firstParkLabel = parkLabels[0];
        expect(firstParkLabel).toBeDefined();
        if (!firstParkLabel) {
            return;
        }

        expect(firstParkLabel.text).toMatch(/(Park|Garden)$/);
    });
});
