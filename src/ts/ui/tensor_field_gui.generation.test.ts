import { beforeEach, describe, expect, test, vi } from 'vitest';
import TensorFieldGUI from './tensor_field_gui';
import DomainController from './domain_controller';
import DragController from './drag_controller';
import Vector from '../vector';
import type { NoiseParams } from '../impl/tensor_field';

vi.mock('../impl/polygon_util', () => ({
    default: {
        insidePolygon: () => false,
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

function createNoiseParams(): NoiseParams {
    return {
        globalNoise: false,
        noiseSizePark: 20,
        noiseAnglePark: 90,
        noiseSizeGlobal: 30,
        noiseAngleGlobal: 20,
    };
}

function createDragControllerMock(): DragController {
    return {
        register: vi.fn().mockReturnValue(() => undefined),
    } as unknown as DragController;
}

describe('TensorFieldGUI generation bounds', () => {
    beforeEach(() => {
        const controller = DomainController.getInstance();
        controller.screenDimensions = new Vector(1440, 900);
        controller.zoom = 1;
        controller.centerOnWorldPoint(new Vector(720, 450));
    });

    test('setRecommended uses explicit generation bounds independently of zoom', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const tensorField = new TensorFieldGUI(createMockGuiFolder(), createDragControllerMock(), false, createNoiseParams());
        const bounds = {
            origin: new Vector(100, 200),
            worldDimensions: new Vector(300, 150),
        };
        const controller = DomainController.getInstance();

        controller.zoom = 0.8;
        tensorField.setRecommended(bounds);
        const zoomedOutCentres = tensorField.getCentrePoints().map((point) => ({ x: point.x, y: point.y }));

        controller.zoom = 2;
        tensorField.setRecommended(bounds);
        const zoomedInCentres = tensorField.getCentrePoints().map((point) => ({ x: point.x, y: point.y }));

        expect(zoomedInCentres).toEqual(zoomedOutCentres);
        randomSpy.mockRestore();
    });
});
