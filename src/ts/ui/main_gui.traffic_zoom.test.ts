import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import MainGUI from './main_gui';
import Util from '../util';

vi.mock('./road_gui', () => ({
    default: class MockRoadGUI {
        public roads: Array<unknown> = [];
        public allStreamlines: Array<unknown> = [];
        public animate = true;

        initFolder(): this {
            return this;
        }

        setExistingStreamlines(): void {}

        setPreGenerateCallback(): void {}

        setPostGenerateCallback(): void {}

        clearStreamlines(): void {}

        async generateRoads(): Promise<void> {}

        update(): boolean {
            return false;
        }

        roadsEmpty(): boolean {
            return true;
        }
    }
}));

vi.mock('./water_gui', () => ({
    default: class MockWaterGUI {
        public seaPolygon: Array<unknown> = [];
        public coastline: Array<unknown> = [];
        public river: Array<unknown> = [];
        public roads: Array<unknown> = [];
        public secondaryRiver: Array<unknown> = [];
        public streamlinesWithSecondaryRoad: Array<unknown> = [];

        initFolder(): this {
            return this;
        }

        setPreGenerateCallback(): void {}

        generateRoads(): void {}

        roadsEmpty(): boolean {
            return true;
        }
    }
}));

vi.mock('./buildings', () => ({
    default: class MockBuildings {
        public lots: Array<unknown> = [];
        public models: Array<unknown> = [];
        public lotWorlds: Array<unknown> = [];
        public lotWorldCentroids: Array<unknown> = [];
        public animate = true;

        setPreGenerateCallback(): void {}

        setAllStreamlines(): void {}

        reset(): void {}

        async generate(): Promise<void> {}

        update(): boolean {
            return false;
        }

        getLotWorldCentroid(): null {
            return null;
        }

        async getBlocks(): Promise<Array<unknown>> {
            return [];
        }
    },
}));

vi.mock('../impl/graph', () => ({
    default: class MockGraph {
        public intersections: Array<unknown> = [];
        public nodes: Array<unknown> = [];
    },
}));

vi.mock('../impl/polygon_finder', () => ({
    default: class MockPolygonFinder {
        public polygons: Array<unknown> = [];

        findPolygons(): void {}
    },
}));

vi.mock('../impl/polygon_util', () => ({
    default: {
        resizeGeometry: (geometry: unknown) => geometry,
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

describe('MainGUI traffic zoom independence', () => {
    beforeEach(() => {
        const canvas = document.createElement('canvas');
        canvas.id = Util.CANVAS_ID;
        document.body.appendChild(canvas);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    test('does not clamp traffic simulation to viewport bounds during update', () => {
        const guiFolder = createMockGuiFolder();
        const tensorField: any = {
            parks: [] as unknown[],
            sea: [] as unknown[],
            river: [] as unknown[],
            ignoreRiver: false,
        };

        const mainGui = new MainGUI(guiFolder, tensorField, () => undefined);
        (mainGui as any).trafficNetworkDirty = false;

        const setWorldBoundsSpy = vi.spyOn((mainGui as any).trafficSimulation, 'setWorldBounds');
        mainGui.update(0.016);

        expect(setWorldBoundsSpy).not.toHaveBeenCalled();
    });
});
