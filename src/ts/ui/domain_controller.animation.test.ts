import { describe, expect, test } from 'vitest';
import DomainController from './domain_controller';
import Vector from '../vector';

describe('DomainController animateToWorldPoint', () => {
    test('applies target center and zoom immediately when duration is zero', () => {
        const controller = DomainController.getInstance();
        controller.screenDimensions = new Vector(1000, 500);
        controller.zoom = 1;

        const target = new Vector(220, 140);
        controller.animateToWorldPoint(target, {
            zoom: 13,
            durationMs: 0,
        });

        const center = controller.origin.add(controller.worldDimensions.divideScalar(2));
        expect(controller.zoom).toBeCloseTo(13, 5);
        expect(center.x).toBeCloseTo(target.x, 5);
        expect(center.y).toBeCloseTo(target.y, 5);
    });
});
