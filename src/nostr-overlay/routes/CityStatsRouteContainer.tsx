import type { ComponentProps } from 'react';
import { CityStatsPage } from '../components/CityStatsPage';

type CityStatsPageProps = ComponentProps<typeof CityStatsPage>;

export interface CityStatsRouteContainerProps {
    buildingsCount: CityStatsPageProps['buildingsCount'];
    occupiedBuildingsCount: CityStatsPageProps['occupiedBuildingsCount'];
    followedPubkeys: CityStatsPageProps['followedPubkeys'];
    followerPubkeys: CityStatsPageProps['followerPubkeys'];
    profilesByPubkey: CityStatsPageProps['profilesByPubkey'];
    verificationByPubkey: CityStatsPageProps['verificationByPubkey'];
    parkCount: CityStatsPageProps['parkCount'];
}

export function CityStatsRouteContainer({
    buildingsCount,
    occupiedBuildingsCount,
    followedPubkeys,
    followerPubkeys,
    profilesByPubkey,
    verificationByPubkey,
    parkCount,
}: CityStatsRouteContainerProps) {
    return (
        <CityStatsPage
            buildingsCount={buildingsCount}
            occupiedBuildingsCount={occupiedBuildingsCount}
            followedPubkeys={followedPubkeys}
            followerPubkeys={followerPubkeys}
            profilesByPubkey={profilesByPubkey}
            verificationByPubkey={verificationByPubkey}
            parkCount={parkCount}
        />
    );
}
