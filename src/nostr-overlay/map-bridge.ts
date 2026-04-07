export interface WorldPoint {
    x: number;
    y: number;
}

export interface MapBuildingSlot {
    index: number;
    centroid: WorldPoint;
}

export interface MapMainApi {
    generateMap(): Promise<void> | void;
    roadsEmpty(): boolean;
    getBuildingCentroidsWorld(): WorldPoint[];
    setOccupancyByBuildingIndex(byBuildingIndex: Record<number, string>): void;
    setSelectedBuildingIndex(index?: number): void;
    focusBuilding(index: number): boolean | void;
    subscribeMapGenerated?(listener: () => void): (() => void) | void;
}

export interface MapBridge {
    ensureGenerated(): Promise<void>;
    listBuildings(): MapBuildingSlot[];
    applyOccupancy(input: { byBuildingIndex: Record<number, string>; selectedBuildingIndex?: number }): void;
    focusBuilding(index: number): void;
    onMapGenerated(listener: () => void): () => void;
}

export function createMapBridge(mainApi: MapMainApi): MapBridge {
    return {
        async ensureGenerated(): Promise<void> {
            if (mainApi.roadsEmpty()) {
                await Promise.resolve(mainApi.generateMap());
            }
        },

        listBuildings(): MapBuildingSlot[] {
            return mainApi.getBuildingCentroidsWorld().map((centroid, index) => ({
                index,
                centroid: {
                    x: centroid.x,
                    y: centroid.y,
                },
            }));
        },

        applyOccupancy(input: { byBuildingIndex: Record<number, string>; selectedBuildingIndex?: number }): void {
            mainApi.setOccupancyByBuildingIndex(input.byBuildingIndex);
            mainApi.setSelectedBuildingIndex(input.selectedBuildingIndex);
        },

        focusBuilding(index: number): void {
            mainApi.focusBuilding(index);
        },

        onMapGenerated(listener: () => void): () => void {
            if (!mainApi.subscribeMapGenerated) {
                return () => {};
            }

            const maybeUnsubscribe = mainApi.subscribeMapGenerated(listener);
            if (typeof maybeUnsubscribe === 'function') {
                return maybeUnsubscribe;
            }

            return () => {};
        },
    };
}

declare global {
    interface Window {
        mapGeneratorMain?: MapMainApi;
    }
}

export function createWindowMapBridge(win: Window = window): MapBridge | null {
    if (!win.mapGeneratorMain) {
        return null;
    }

    return createMapBridge(win.mapGeneratorMain);
}
