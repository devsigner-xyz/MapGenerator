export interface CityStatsInput {
    buildingsCount: number;
    occupiedBuildingsCount: number;
    assignedResidentsCount: number;
    followsCount: number;
    followersCount: number;
    parkCount: number;
    unhousedResidentsCount?: number;
}

interface CityHousingStats {
    total: number;
    occupied: number;
    available: number;
    occupancyRate: number;
}

interface CityPopulationStats {
    assigned: number;
    unhoused: number;
    coverageRate: number;
}

interface CityNetworkStats {
    follows: number;
    followers: number;
}

interface CityTerrainStats {
    parks: number;
}

export interface CityStats {
    housing: CityHousingStats;
    population: CityPopulationStats;
    network: CityNetworkStats;
    terrain: CityTerrainStats;
}

function toSafeCount(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function percentage(part: number, total: number): number {
    if (total <= 0) {
        return 0;
    }

    return (part / total) * 100;
}

export function buildCityStats(input: CityStatsInput): CityStats {
    const totalBuildings = toSafeCount(input.buildingsCount);
    const occupiedBuildings = Math.min(totalBuildings, toSafeCount(input.occupiedBuildingsCount));
    const availableBuildings = Math.max(0, totalBuildings - occupiedBuildings);
    const assignedResidents = toSafeCount(input.assignedResidentsCount);
    const follows = toSafeCount(input.followsCount);
    const followers = toSafeCount(input.followersCount);
    const parks = toSafeCount(input.parkCount);
    const inferredUnhoused = Math.max(0, follows - assignedResidents);
    const unhousedResidents = input.unhousedResidentsCount === undefined
        ? inferredUnhoused
        : toSafeCount(input.unhousedResidentsCount);

    return {
        housing: {
            total: totalBuildings,
            occupied: occupiedBuildings,
            available: availableBuildings,
            occupancyRate: percentage(occupiedBuildings, totalBuildings),
        },
        population: {
            assigned: assignedResidents,
            unhoused: unhousedResidents,
            coverageRate: percentage(assignedResidents, follows),
        },
        network: {
            follows,
            followers,
        },
        terrain: {
            parks,
        },
    };
}
