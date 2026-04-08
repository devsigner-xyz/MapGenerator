import { describe, expect, test, vi } from 'vitest';
import { createMapBridge, type MapMainApi } from './map-bridge';

function createMainApiStub(overrides: Partial<MapMainApi> = {}): MapMainApi {
    return {
        generateMap: vi.fn().mockResolvedValue(undefined),
        roadsEmpty: vi.fn().mockReturnValue(false),
        getBuildingCentroidsWorld: vi.fn().mockReturnValue([{ x: 10, y: 20 }, { x: 30, y: 40 }]),
        setOccupancyByBuildingIndex: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setSelectedBuildingIndex: vi.fn(),
        setModalHighlightedBuildingIndex: vi.fn(),
        setStreetLabelsEnabled: vi.fn(),
        setStreetLabelsZoomLevel: vi.fn(),
        setStreetLabelUsernames: vi.fn(),
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn().mockReturnValue(true),
        getParkCount: vi.fn().mockReturnValue(3),
        getZoom: vi.fn().mockReturnValue(8),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => ({ x: point.x + 1, y: point.y + 2 })),
        getViewportInsetLeft: vi.fn().mockReturnValue(120),
        subscribeMapGenerated: vi.fn().mockReturnValue(() => {}),
        subscribeOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        subscribeViewChanged: vi.fn().mockReturnValue(() => {}),
        ...overrides,
    };
}

describe('createMapBridge', () => {
    test('ensureGenerated triggers map generation only when roads are empty', async () => {
        const emptyRoadsApi = createMainApiStub({ roadsEmpty: vi.fn().mockReturnValue(true) });
        const nonEmptyRoadsApi = createMainApiStub({ roadsEmpty: vi.fn().mockReturnValue(false) });

        await createMapBridge(emptyRoadsApi).ensureGenerated();
        await createMapBridge(nonEmptyRoadsApi).ensureGenerated();

        expect(emptyRoadsApi.generateMap).toHaveBeenCalledTimes(1);
        expect(nonEmptyRoadsApi.generateMap).not.toHaveBeenCalled();
    });

    test('regenerateMap always triggers map generation', async () => {
        const api = createMainApiStub({ roadsEmpty: vi.fn().mockReturnValue(false) });
        const bridge = createMapBridge(api);

        await bridge.regenerateMap();

        expect(api.generateMap).toHaveBeenCalledTimes(1);
    });

    test('listBuildings returns indexed centroid slots from map api', () => {
        const api = createMainApiStub({
            getBuildingCentroidsWorld: vi.fn().mockReturnValue([{ x: 1, y: 2 }, { x: 3, y: 4 }]),
        });

        const bridge = createMapBridge(api);
        expect(bridge.listBuildings()).toEqual([
            { index: 0, centroid: { x: 1, y: 2 } },
            { index: 1, centroid: { x: 3, y: 4 } },
        ]);
    });

    test('applyOccupancy forwards occupancy and selected building to map api', () => {
        const api = createMainApiStub();
        const bridge = createMapBridge(api);

        bridge.applyOccupancy({
            byBuildingIndex: {
                2: 'pubkey-c',
                4: 'pubkey-d',
            },
            selectedBuildingIndex: 4,
        });

        expect(api.setOccupancyByBuildingIndex).toHaveBeenCalledWith({
            2: 'pubkey-c',
            4: 'pubkey-d',
        });
        expect(api.setSelectedBuildingIndex).toHaveBeenCalledWith(4);
    });

    test('focusBuilding delegates building index to map api', () => {
        const api = createMainApiStub();
        const bridge = createMapBridge(api);

        bridge.focusBuilding(3);
        expect(api.focusBuilding).toHaveBeenCalledWith(3);
    });

    test('setModalBuildingHighlight delegates building index to map api', () => {
        const api = createMainApiStub();
        const bridge = createMapBridge(api);

        bridge.setModalBuildingHighlight(6);
        bridge.setModalBuildingHighlight(undefined);

        expect(api.setModalHighlightedBuildingIndex).toHaveBeenNthCalledWith(1, 6);
        expect(api.setModalHighlightedBuildingIndex).toHaveBeenNthCalledWith(2, undefined);
    });

    test('setViewportInsetLeft delegates inset value to map api', () => {
        const api = createMainApiStub();
        const bridge = createMapBridge(api);

        bridge.setViewportInsetLeft(380);
        bridge.setViewportInsetLeft(0);

        expect(api.setViewportInsetLeft).toHaveBeenNthCalledWith(1, 380);
        expect(api.setViewportInsetLeft).toHaveBeenNthCalledWith(2, 0);
    });

    test('street label settings delegate to map api', () => {
        const api = createMainApiStub();
        const bridge = createMapBridge(api);

        bridge.setStreetLabelsEnabled(true);
        bridge.setStreetLabelsZoomLevel(10);
        bridge.setStreetLabelUsernames(['alice', 'bob']);

        expect(api.setStreetLabelsEnabled).toHaveBeenCalledWith(true);
        expect(api.setStreetLabelsZoomLevel).toHaveBeenCalledWith(10);
        expect(api.setStreetLabelUsernames).toHaveBeenCalledWith(['alice', 'bob']);
    });

    test('getZoom delegates to map api', () => {
        const api = createMainApiStub({ getZoom: vi.fn().mockReturnValue(11) });
        const bridge = createMapBridge(api);

        expect(bridge.getZoom()).toBe(11);
        expect(api.getZoom).toHaveBeenCalledTimes(1);
    });

    test('worldToScreen delegates point projection to map api', () => {
        const api = createMainApiStub({
            worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => ({
                x: point.x * 2,
                y: point.y * 2,
            })),
        });
        const bridge = createMapBridge(api);

        expect(bridge.worldToScreen({ x: 4, y: 7 })).toEqual({ x: 8, y: 14 });
        expect(api.worldToScreen).toHaveBeenCalledWith({ x: 4, y: 7 });
    });

    test('getViewportInsetLeft delegates to map api', () => {
        const api = createMainApiStub({ getViewportInsetLeft: vi.fn().mockReturnValue(300) });
        const bridge = createMapBridge(api);

        expect(bridge.getViewportInsetLeft()).toBe(300);
        expect(api.getViewportInsetLeft).toHaveBeenCalledTimes(1);
    });

    test('getParkCount delegates to map api', () => {
        const api = createMainApiStub({ getParkCount: vi.fn().mockReturnValue(9) });
        const bridge = createMapBridge(api);

        expect(bridge.getParkCount()).toBe(9);
        expect(api.getParkCount).toHaveBeenCalledTimes(1);
    });

    test('mountSettingsPanel delegates container to map api', () => {
        const api = createMainApiStub();
        const bridge = createMapBridge(api);
        const container = document.createElement('div');

        bridge.mountSettingsPanel(container);
        bridge.mountSettingsPanel(null);

        expect(api.mountSettingsPanel).toHaveBeenNthCalledWith(1, container);
        expect(api.mountSettingsPanel).toHaveBeenNthCalledWith(2, null);
    });

    test('onMapGenerated subscribes and unsubscribes using map api listener hooks', () => {
        const unsubscribe = vi.fn();
        const subscribe = vi.fn().mockReturnValue(unsubscribe);
        const api = createMainApiStub({ subscribeMapGenerated: subscribe });
        const bridge = createMapBridge(api);
        const listener = vi.fn();

        const off = bridge.onMapGenerated(listener);

        expect(subscribe).toHaveBeenCalledWith(listener);
        off();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    test('onOccupiedBuildingClick subscribes and unsubscribes using map api listener hooks', () => {
        const unsubscribe = vi.fn();
        const subscribe = vi.fn().mockReturnValue(unsubscribe);
        const api = createMainApiStub({ subscribeOccupiedBuildingClick: subscribe });
        const bridge = createMapBridge(api);
        const listener = vi.fn();

        const off = bridge.onOccupiedBuildingClick(listener);

        expect(subscribe).toHaveBeenCalledWith(listener);
        off();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    test('onViewChanged subscribes and unsubscribes using map api listener hooks', () => {
        const unsubscribe = vi.fn();
        const subscribe = vi.fn().mockReturnValue(unsubscribe);
        const api = createMainApiStub({ subscribeViewChanged: subscribe });
        const bridge = createMapBridge(api);
        const listener = vi.fn();

        const off = bridge.onViewChanged(listener);

        expect(subscribe).toHaveBeenCalledWith(listener);
        off();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
