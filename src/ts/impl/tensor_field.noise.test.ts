import { describe, expect, test, vi } from 'vitest';

vi.mock('./polygon_util', () => ({
    default: {
        insidePolygon: () => false,
    },
}));

import TensorField from './tensor_field';
import Vector from '../vector';

function createNoiseParams() {
    return {
        globalNoise: false,
        noiseSizePark: 20,
        noiseAnglePark: 90,
        noiseSizeGlobal: 30,
        noiseAngleGlobal: 20,
    };
}

describe('TensorField rotational noise', () => {
    test('returns zero when noise angle is zero', () => {
        const tensorField = new TensorField(createNoiseParams());

        const noise = tensorField.getRotationalNoise(new Vector(10, 20), 25, 0);

        expect(noise).toBe(0);
    });

    test('returns deterministic value for same input on same instance', () => {
        const tensorField = new TensorField(createNoiseParams());
        const point = new Vector(123.5, 456.25);

        const first = tensorField.getRotationalNoise(point, 30, 15);
        const second = tensorField.getRotationalNoise(point, 30, 15);

        expect(second).toBe(first);
        expect(Number.isFinite(first)).toBe(true);
    });
});
