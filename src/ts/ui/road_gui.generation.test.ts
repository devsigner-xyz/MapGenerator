import { beforeEach, describe, expect, test, vi } from 'vitest';
import DomainController from './domain_controller';
import RoadGUI from './road_gui';
import Util from '../util';
import Vector from '../vector';

const streamlineConstructorCalls: Array<{ origin: Vector; worldDimensions: Vector; params: Record<string, number> }> = [];

vi.mock('../impl/streamlines', () => ({
    default: class MockStreamlineGenerator {
        public allStreamlinesSimple: Vector[][] = [];

        constructor(_integrator: unknown, origin: Vector, worldDimensions: Vector, params: Record<string, number>) {
            streamlineConstructorCalls.push({
                origin: origin.clone(),
                worldDimensions: worldDimensions.clone(),
                params: { ...params },
            });
        }

        addExistingStreamlines(): void {}
        clearStreamlines(): void {}
        update(): boolean { return false; }
        createAllStreamlines(): Promise<void> { return Promise.resolve(); }
    },
}));

function createMockController() {
    return {
        onChange: vi.fn().mockReturnThis(),
        step: vi.fn().mockReturnThis(),
        updateDisplay: vi.fn(),
    };
}

function createMockGuiFolder(): dat.GUI {
    const controller = createMockController();
    const folder = {
        add: vi.fn(() => controller),
        addFolder: vi.fn(() => createMockGuiFolder()),
        close: vi.fn(),
    };

    return folder as unknown as dat.GUI;
}

describe('RoadGUI generation bounds', () => {
    beforeEach(() => {
        streamlineConstructorCalls.length = 0;
        const controller = DomainController.getInstance();
        controller.screenDimensions = new Vector(1440, 900);
        controller.zoom = 3;
        controller.centerOnWorldPoint(new Vector(720, 450));
    });

    test('generateRoads inflates explicit bounds, updates pathIterations, and does not mutate zoom', async () => {
        const controller = DomainController.getInstance();
        const params = {
            dsep: 20,
            dtest: 15,
            dstep: 2,
            dlookahead: 40,
            dcirclejoin: 5,
            joinangle: 0.1,
            pathIterations: 1,
            seedTries: 300,
            simplifyTolerance: 0.5,
            collideEarly: 0,
        };
        const roadGui = new RoadGUI(params, {} as never, createMockGuiFolder(), () => undefined, 'Main', () => undefined);
        const beforeZoom = controller.zoom;

        await roadGui.generateRoads({
            origin: new Vector(100, 200),
            worldDimensions: new Vector(200, 100),
        });

        const lastCall = streamlineConstructorCalls[streamlineConstructorCalls.length - 1];
        expect(controller.zoom).toBe(beforeZoom);
        expect(lastCall?.worldDimensions).toEqual(new Vector(200, 100).multiplyScalar(Util.DRAW_INFLATE_AMOUNT));
        expect(lastCall?.origin).toEqual(new Vector(80, 190));
        expect(lastCall?.params.pathIterations).toBe((1.5 * 240) / 2);
    });
});
