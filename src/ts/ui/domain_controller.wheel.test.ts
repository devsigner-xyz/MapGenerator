import { afterEach, describe, expect, test } from 'vitest';
import DomainController from './domain_controller';
import Vector from '../vector';
import Util from '../util';

function dispatchWheel(deltaY: number): void {
    const canvas = document.createElement('canvas');
    canvas.id = Util.CANVAS_ID;
    document.body.appendChild(canvas);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true }));
    canvas.remove();
}

describe('DomainController wheel zoom sensitivity', () => {
    afterEach(() => {
        const controller = DomainController.getInstance();
        controller.zoom = 1;
        controller.screenDimensions = new Vector(1200, 800);
    });

    test('zooms in more aggressively with a single mouse wheel notch', () => {
        const controller = DomainController.getInstance();
        controller.screenDimensions = new Vector(1200, 800);
        controller.zoom = 1;

        dispatchWheel(-100);

        expect(controller.zoom).toBeGreaterThan(1.12);
    });

    test('zooms out more aggressively with a single mouse wheel notch', () => {
        const controller = DomainController.getInstance();
        controller.screenDimensions = new Vector(1200, 800);
        controller.zoom = 1;

        dispatchWheel(100);

        expect(controller.zoom).toBeLessThan(0.9);
    });
});
