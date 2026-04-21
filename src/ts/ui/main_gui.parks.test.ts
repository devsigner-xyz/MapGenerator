import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import MainGUI from './main_gui';
import Util from '../util';
import Vector from '../vector';

const graphSpy = vi.fn();

vi.mock('./road_gui', () => ({
    default: class MockRoadGUI {
        public roads: Array<unknown> = [];
        public allStreamlines: Vector[][] = [];
        public animate = true;

        initFolder(): this { return this; }
        setExistingStreamlines(): void {}
        setPreGenerateCallback(): void {}
        setPostGenerateCallback(): void {}
        clearStreamlines(): void {}
        async generateRoads(): Promise<void> {}
        update(): boolean { return false; }
        roadsEmpty(): boolean { return true; }
    },
}));

vi.mock('./water_gui', () => ({
    default: class MockWaterGUI {
        public seaPolygon: Array<unknown> = [];
        public coastline: Array<unknown> = [];
        public river: Array<unknown> = [];
        public roads: Array<unknown> = [];
        public secondaryRiver: Array<unknown> = [];
        public streamlinesWithSecondaryRoad: Vector[][] = [];

        initFolder(): this { return this; }
        setPreGenerateCallback(): void {}
        async generateRoads(): Promise<void> {}
        roadsEmpty(): boolean { return true; }
    },
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
        update(): boolean { return false; }
        getLotWorldCentroid(): null { return null; }
        async getBlocks(): Promise<Array<unknown>> { return []; }
    },
}));

vi.mock('../impl/graph', () => ({
    default: class MockGraph {
        public intersections: Array<unknown> = [];
        public nodes: Array<unknown> = [];

        constructor(...args: unknown[]) {
            graphSpy(...args);
        }
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

describe('MainGUI parks generation', () => {
    beforeEach(() => {
        graphSpy.mockClear();
        const canvas = document.createElement('canvas');
        canvas.id = Util.CANVAS_ID;
        document.body.appendChild(canvas);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    test('addParks skips graph generation when no streamlines are available', () => {
        const mainGui = new MainGUI(createMockGuiFolder(), {
            parks: [] as Vector[][],
            sea: [] as Vector[],
            river: [] as Vector[],
            ignoreRiver: false,
        } as never, () => undefined);

        mainGui.addParks();

        expect(graphSpy).not.toHaveBeenCalled();
    });
});
