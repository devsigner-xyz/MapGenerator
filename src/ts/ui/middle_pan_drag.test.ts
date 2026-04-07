import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import { createMiddlePanState, updateMiddlePanState } from './middle_pan_drag';

describe('middle pan drag state', () => {
    test('computes delta when active middle-pan receives mousemove', () => {
        const activeState = createMiddlePanState(new Vector(100, 80));
        const { deltaScreen, state } = updateMiddlePanState(activeState, new Vector(112, 91));

        expect(deltaScreen).toEqual(new Vector(12, 11));
        expect(state.lastScreenPoint).toEqual(new Vector(112, 91));
    });

    test('returns null delta when middle-pan is inactive', () => {
        const { deltaScreen } = updateMiddlePanState({ active: false, lastScreenPoint: null }, new Vector(50, 30));
        expect(deltaScreen).toBeNull();
    });
});
