import { describe, expect, test } from 'vitest';
import colourSchemes from './colour_schemes';

describe('colour schemes defaults', () => {
    test('Nostr City Light replaces Google as the default light preset', () => {
        const nostrCityLight = (colourSchemes as any)['Nostr City Light'];

        expect((colourSchemes as any).Google).toBeUndefined();
        expect(nostrCityLight).toMatchObject({
            bgColour: 'rgb(236,236,236)',
            bgColourIn: 'rgb(248,249,250)',
            buildingModels: false,
            zoomBuildings: true,
            outlineSize: 2,
        });
    });

    test('Nostr City Dark mirrors Nostr City Light behavior with neon logo colours', () => {
        const nostrCityDark = (colourSchemes as any)['Nostr City Dark'];

        expect(nostrCityDark).toMatchObject({
            bgColour: '#010432',
            bgColourIn: '#011556',
            buildingColour: '#0D2279',
            buildingSideColour: '#011556',
            buildingStroke: '#233CB5',
            seaColour: '#34108A',
            grassColour: '#4C1FAE',
            minorRoadColour: '#A2F0FE',
            minorRoadOutline: '#233CB5',
            majorRoadColour: '#2ABAFB',
            majorRoadOutline: '#7546D4',
            mainRoadColour: '#DB5FF7',
            mainRoadOutline: '#C586F2',
            frameColour: '#010432',
            frameTextColour: '#FCFDFE',
            occupiedBuildingColour: '#2ABAFB',
            occupiedBuildingStroke: '#233CB5',
            zoomBuildings: true,
            buildingModels: false,
            outlineSize: 2,
        });
    });
});
