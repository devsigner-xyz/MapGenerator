import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MapBridge } from '../map-bridge';
import { MapSettingsModal } from './MapSettingsModal';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

function createBridgeStub(): MapBridge {
    return {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([]),
        applyOccupancy: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setModalBuildingHighlight: vi.fn(),
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn(),
        getParkCount: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        getZoom: vi.fn().mockReturnValue(1),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('MapSettingsModal UI settings', () => {
    test('shows UI as first settings section and persists occupied label zoom level', async () => {
        const onUiSettingsChange = vi.fn();
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsModal
                mapBridge={bridge}
                onClose={() => {}}
                onUiSettingsChange={onUiSettingsChange}
            />
        );
        mounted.push(rendered);

        const settingsItems = Array.from(rendered.container.querySelectorAll('.nostr-settings-content .nostr-settings-item'));
        expect(settingsItems[0]?.textContent || '').toContain('UI');

        await act(async () => {
            (settingsItems[0] as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const zoomInput = rendered.container.querySelector('input[aria-label="Occupied labels zoom level"]') as HTMLInputElement;
        expect(zoomInput).toBeDefined();
        expect(zoomInput.type).toBe('range');
        expect(zoomInput.value).toBe('8');

        const sliderMarks = Array.from(rendered.container.querySelectorAll('.nostr-ui-slider-marks span')).map((node) => node.textContent || '');
        expect(sliderMarks).toEqual(['1', '8', '20']);

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(zoomInput, '12');
            zoomInput.dispatchEvent(new Event('input', { bubbles: true }));
            zoomInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(onUiSettingsChange).toHaveBeenCalled();
        const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
        expect(raw).not.toBeNull();
        expect(raw || '').toContain('12');
    });
});
