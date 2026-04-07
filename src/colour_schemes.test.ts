import { describe, expect, test } from 'vitest';
import colourSchemes from './colour_schemes';

describe('colour schemes defaults', () => {
    test('Google keeps 3D building models disabled by default', () => {
        expect((colourSchemes as any).Google.buildingModels).toBe(false);
    });
});
