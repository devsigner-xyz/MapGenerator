import { describe, expect, test } from 'vitest';
import colourSchemes from './colour_schemes';

function hexToRgb(hex: string): [number, number, number] {
    const normalized = hex.replace('#', '');
    return [
        Number.parseInt(normalized.slice(0, 2), 16),
        Number.parseInt(normalized.slice(2, 4), 16),
        Number.parseInt(normalized.slice(4, 6), 16),
    ];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
    const [r, g, b] = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
    const foregroundLuminance = relativeLuminance(hexToRgb(foreground));
    const backgroundLuminance = relativeLuminance(hexToRgb(background));
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);

    return (lighter + 0.05) / (darker + 0.05);
}

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
            hoveredBuildingColour: '#DB5FF7',
            hoveredBuildingStroke: '#A2F0FE',
            streetLabelColour: '#010B2D',
            waterLabelColour: '#BFEFFF',
            parkLabelColour: '#F0D7FF',
            zoomBuildings: true,
            buildingModels: false,
            outlineSize: 2,
        });
    });

    test('Nostr City Dark label colours pass WCAG AA contrast against their map surfaces', () => {
        const nostrCityDark = (colourSchemes as any)['Nostr City Dark'];
        const minimumNormalTextContrast = 4.5;

        expect(contrastRatio(nostrCityDark.streetLabelColour, nostrCityDark.minorRoadColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(contrastRatio(nostrCityDark.streetLabelColour, nostrCityDark.majorRoadColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(contrastRatio(nostrCityDark.streetLabelColour, nostrCityDark.mainRoadColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(contrastRatio(nostrCityDark.waterLabelColour, nostrCityDark.seaColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(contrastRatio(nostrCityDark.parkLabelColour, nostrCityDark.grassColour)).toBeGreaterThanOrEqual(minimumNormalTextContrast);
    });
});
