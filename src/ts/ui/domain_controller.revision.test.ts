import { describe, expect, test } from 'vitest';
import DomainController from './domain_controller';
import Vector from '../vector';

describe('DomainController viewRevision', () => {
    test('increments on pan/zoom/inset changes', () => {
        const controller = DomainController.getInstance();
        controller.screenDimensions = new Vector(1200, 800);
        controller.zoom = 1;

        const startRevision = controller.viewRevision;

        controller.pan(new Vector(10, 0));
        expect(controller.viewRevision).toBeGreaterThan(startRevision);

        const afterPan = controller.viewRevision;
        controller.zoom = 1.25;
        expect(controller.viewRevision).toBeGreaterThan(afterPan);

        const afterZoom = controller.viewRevision;
        controller.setViewportInsetLeft(240);
        expect(controller.viewRevision).toBeGreaterThan(afterZoom);
    });
});
