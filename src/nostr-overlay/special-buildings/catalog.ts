import type { SpecialBuildingId } from '../../ts/ui/special_buildings';

export type SpecialBuildingAction = 'open_agora';

export interface SpecialBuildingEntry {
    id: SpecialBuildingId;
    title: string;
    markerSymbol: string;
    action: SpecialBuildingAction;
}

export const SPECIAL_BUILDING_CATALOG: Record<SpecialBuildingId, SpecialBuildingEntry> = {
    agora: {
        id: 'agora',
        title: 'Agora',
        markerSymbol: 'A',
        action: 'open_agora',
    },
};

export function getSpecialBuildingEntry(id: SpecialBuildingId): SpecialBuildingEntry {
    return SPECIAL_BUILDING_CATALOG[id];
}
