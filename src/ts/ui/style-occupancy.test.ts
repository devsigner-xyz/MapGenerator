import { describe, expect, test } from 'vitest';
import { resolveBuildingRenderColours, type ColourScheme } from './style';

const baseScheme: ColourScheme = {
    bgColour: 'rgb(255,255,255)',
    seaColour: 'rgb(0,0,255)',
    minorRoadColour: 'rgb(100,100,100)',
    buildingColour: 'rgb(240,240,240)',
    buildingStroke: 'rgb(200,200,200)',
};

describe('resolveBuildingRenderColours', () => {
    test('returns default scheme colors for empty buildings', () => {
        const colours = resolveBuildingRenderColours('empty', baseScheme);
        expect(colours).toEqual({
            fill: 'rgb(240,240,240)',
            stroke: 'rgb(200,200,200)',
        });
    });

    test('returns occupied colors for occupied buildings', () => {
        const colours = resolveBuildingRenderColours('occupied', baseScheme);
        expect(colours).toEqual({
            fill: 'rgb(247,240,206)',
            stroke: 'rgb(228,202,120)',
        });
    });

    test('returns selected colors for selected buildings', () => {
        const colours = resolveBuildingRenderColours('selected', baseScheme);
        expect(colours).toEqual({
            fill: 'rgb(255,214,118)',
            stroke: 'rgb(233,166,52)',
        });
    });
});
