import type { ComponentProps } from 'react';
import { CityStatsPage } from '../components/CityStatsPage';

type CityStatsPageProps = ComponentProps<typeof CityStatsPage>;

export interface CityStatsRouteContainerProps {
    buildingsCount: CityStatsPageProps['buildingsCount'];
    occupiedBuildingsCount: CityStatsPageProps['occupiedBuildingsCount'];
    assignedResidentsCount: CityStatsPageProps['assignedResidentsCount'];
    followsCount: CityStatsPageProps['followsCount'];
    followersCount: CityStatsPageProps['followersCount'];
    parkCount: CityStatsPageProps['parkCount'];
    unhousedResidentsCount: CityStatsPageProps['unhousedResidentsCount'];
}

export function CityStatsRouteContainer({
    buildingsCount,
    occupiedBuildingsCount,
    assignedResidentsCount,
    followsCount,
    followersCount,
    parkCount,
    unhousedResidentsCount,
}: CityStatsRouteContainerProps) {
    return (
        <CityStatsPage
            buildingsCount={buildingsCount}
            occupiedBuildingsCount={occupiedBuildingsCount}
            assignedResidentsCount={assignedResidentsCount}
            followsCount={followsCount}
            followersCount={followersCount}
            parkCount={parkCount}
            unhousedResidentsCount={unhousedResidentsCount}
        />
    );
}
