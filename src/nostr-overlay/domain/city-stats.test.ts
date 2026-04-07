import { describe, expect, test } from 'vitest';
import { buildCityStats } from './city-stats';

describe('buildCityStats', () => {
    test('calculates housing and demographic KPIs', () => {
        const stats = buildCityStats({
            buildingsCount: 120,
            occupiedBuildingsCount: 72,
            assignedResidentsCount: 72,
            followsCount: 95,
            followersCount: 64,
            parkCount: 7,
            unhousedResidentsCount: 23,
        });

        expect(stats.housing.total).toBe(120);
        expect(stats.housing.occupied).toBe(72);
        expect(stats.housing.available).toBe(48);
        expect(stats.housing.occupancyRate).toBeCloseTo(60, 2);
        expect(stats.population.assigned).toBe(72);
        expect(stats.population.unhoused).toBe(23);
        expect(stats.population.coverageRate).toBeCloseTo(75.79, 2);
        expect(stats.network.follows).toBe(95);
        expect(stats.network.followers).toBe(64);
        expect(stats.terrain.parks).toBe(7);
    });

    test('derives unhoused count when it is omitted', () => {
        const stats = buildCityStats({
            buildingsCount: 10,
            occupiedBuildingsCount: 6,
            assignedResidentsCount: 6,
            followsCount: 8,
            followersCount: 4,
            parkCount: 1,
        });

        expect(stats.population.unhoused).toBe(2);
    });
});
