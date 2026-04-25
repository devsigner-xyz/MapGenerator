import { useEffect } from 'react';
import type { MapBridge } from '../map-bridge';

interface UseMapBridgeControllerInput {
    mapBridge: MapBridge | null;
    viewportInsetLeft: number;
    showLoginGate: boolean;
    streetLabelsEnabled: boolean;
    streetLabelsZoomLevel: number;
    streetLabelUsernames: string[];
    trafficParticlesCount: number;
    trafficParticlesSpeed: number;
    verifiedBuildingIndexes: number[];
}

interface MapBridgeController {
    focusBuilding: (buildingIndex: number) => void;
}

export function useMapBridgeController({
    mapBridge,
    viewportInsetLeft,
    showLoginGate,
    streetLabelsEnabled,
    streetLabelsZoomLevel,
    streetLabelUsernames,
    trafficParticlesCount,
    trafficParticlesSpeed,
    verifiedBuildingIndexes,
}: UseMapBridgeControllerInput): MapBridgeController {
    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        if (showLoginGate) {
            mapBridge.setViewportInsetLeft(0);
            return () => {
                mapBridge.setViewportInsetLeft(0);
            };
        }

        mapBridge.setViewportInsetLeft(viewportInsetLeft);
        return () => {
            mapBridge.setViewportInsetLeft(0);
        };
    }, [mapBridge, showLoginGate, viewportInsetLeft]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setStreetLabelsEnabled(streetLabelsEnabled);
        mapBridge.setStreetLabelsZoomLevel(streetLabelsZoomLevel);
    }, [mapBridge, streetLabelsEnabled, streetLabelsZoomLevel]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setTrafficParticlesCount(trafficParticlesCount);
        mapBridge.setTrafficParticlesSpeed(trafficParticlesSpeed);
    }, [mapBridge, trafficParticlesCount, trafficParticlesSpeed]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setStreetLabelUsernames(streetLabelUsernames);
    }, [mapBridge, streetLabelUsernames]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setVerifiedBuildingIndexes(verifiedBuildingIndexes);
    }, [mapBridge, verifiedBuildingIndexes]);

    const focusBuilding = (buildingIndex: number): void => {
        if (!mapBridge) {
            return;
        }

        mapBridge.focusBuilding(buildingIndex);
    };

    return {
        focusBuilding,
    };
}
