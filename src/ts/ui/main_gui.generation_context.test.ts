import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import MainGUI from './main_gui';
import Util from '../util';
import Vector from '../vector';

const roadGenerateCalls: Array<{ folderName: string; args: unknown[] }> = [];
const waterGenerateCalls: Array<unknown[]> = [];

vi.mock('./road_gui', () => ({
    default: class MockRoadGUI {
        public roads: Array<unknown> = [];
        public allStreamlines: Array<unknown> = [];
        public animate = true;

        constructor(
            _params: unknown,
            _integrator: unknown,
            _guiFolder: dat.GUI,
            _closeTensorFolder: () => void,
            private readonly folderName: string,
        ) {}

        initFolder(): this { return this; }
        setExistingStreamlines(): void {}
        setPreGenerateCallback(): void {}
        setPostGenerateCallback(): void {}
        clearStreamlines(): void {}
        update(): boolean { return false; }
        roadsEmpty(): boolean { return true; }
        async generateRoads(...args: unknown[]): Promise<void> {
            roadGenerateCalls.push({ folderName: this.folderName, args });
        }
    },
}));

vi.mock('./water_gui', () => ({
    default: class MockWaterGUI {
        public seaPolygon: Array<unknown> = [];
        public coastline: Array<unknown> = [];
        public river: Array<unknown> = [];
        public roads: Array<unknown> = [];
        public secondaryRiver: Array<unknown> = [];
        public streamlinesWithSecondaryRoad: Array<unknown> = [];

        initFolder(): this { return this; }
        setPreGenerateCallback(): void {}
        roadsEmpty(): boolean { return true; }
        async generateRoads(...args: unknown[]): Promise<void> {
            waterGenerateCalls.push(args);
        }
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
        update(): boolean { return false; }
        getLotWorldCentroid(): null { return null; }
        async getBlocks(): Promise<Array<unknown>> { return []; }
        async generate(): Promise<void> {}
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

describe('MainGUI generation bounds propagation', () => {
    beforeEach(() => {
        roadGenerateCalls.length = 0;
        waterGenerateCalls.length = 0;
        const canvas = document.createElement('canvas');
        canvas.id = Util.CANVAS_ID;
        document.body.appendChild(canvas);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    test('generateEverything forwards explicit bounds to water and all road tiers', async () => {
        const mainGui = new MainGUI(createMockGuiFolder(), {
            parks: [] as Vector[][],
            sea: [] as Vector[],
            river: [] as Vector[],
            ignoreRiver: false,
        } as never, () => undefined);
        const bounds = {
            origin: new Vector(100, 200),
            worldDimensions: new Vector(300, 150),
        };

        await mainGui.generateEverything(bounds);

        expect(waterGenerateCalls).toEqual([[bounds]]);
        expect(roadGenerateCalls).toEqual([
            { folderName: 'Main', args: [bounds, true] },
            { folderName: 'Major', args: [bounds, true] },
            { folderName: 'Minor', args: [bounds, true] },
        ]);
    });
});
