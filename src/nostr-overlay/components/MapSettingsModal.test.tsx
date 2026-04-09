import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MapBridge } from '../map-bridge';
import { MapSettingsModal } from './MapSettingsModal';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { ZAP_SETTINGS_STORAGE_KEY } from '../../nostr/zap-settings';

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
        setVerifiedBuildingIndexes: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setModalBuildingHighlight: vi.fn(),
        setStreetLabelsEnabled: vi.fn(),
        setStreetLabelsZoomLevel: vi.fn(),
        setStreetLabelUsernames: vi.fn(),
        setTrafficParticlesCount: vi.fn(),
        setTrafficParticlesSpeed: vi.fn(),
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn(),
        getParkCount: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingContextMenu: vi.fn().mockReturnValue(() => {}),
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

        const streetLabelsToggle = rendered.container.querySelector('button[aria-label="Street labels enabled"]') as HTMLButtonElement;
        expect(streetLabelsToggle).toBeDefined();
        expect(streetLabelsToggle.getAttribute('aria-checked')).toBe('true');

        const verifiedOverlayToggle = rendered.container.querySelector('button[aria-label="Verified buildings overlay enabled"]') as HTMLButtonElement;
        expect(verifiedOverlayToggle).toBeDefined();
        expect(verifiedOverlayToggle.getAttribute('aria-checked')).toBe('false');

        const streetZoomInput = rendered.container.querySelector('input[aria-label="Street labels zoom level"]') as HTMLInputElement;
        expect(streetZoomInput).toBeDefined();
        expect(streetZoomInput.value).toBe('10');

        const trafficCountInput = rendered.container.querySelector('input[aria-label="Cars in city"]') as HTMLInputElement;
        expect(trafficCountInput).toBeDefined();
        expect(trafficCountInput.value).toBe('12');

        const trafficSpeedInput = rendered.container.querySelector('input[aria-label="Cars speed"]') as HTMLInputElement;
        expect(trafficSpeedInput).toBeDefined();
        expect(trafficSpeedInput.value).toBe('1');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(zoomInput, '12');
            zoomInput.dispatchEvent(new Event('input', { bubbles: true }));
            zoomInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            streetLabelsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            verifiedOverlayToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            streetLabelsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(streetZoomInput, '14');
            streetZoomInput.dispatchEvent(new Event('input', { bubbles: true }));
            streetZoomInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(trafficCountInput, '22');
            trafficCountInput.dispatchEvent(new Event('input', { bubbles: true }));
            trafficCountInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(trafficSpeedInput, '1.7');
            trafficSpeedInput.dispatchEvent(new Event('input', { bubbles: true }));
            trafficSpeedInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(onUiSettingsChange).toHaveBeenCalled();
        const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
        expect(raw).not.toBeNull();
        expect(raw || '').toContain('12');
        expect(raw || '').toContain('streetLabelsEnabled');
        expect(raw || '').toContain('verifiedBuildingsOverlayEnabled');
        expect(raw || '').toContain('14');
        expect(raw || '').toContain('"trafficParticlesCount":22');
        expect(raw || '').toContain('"trafficParticlesSpeed":1.7');
    });

    test('shows about panel with supported nips and app features', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsModal
                mapBridge={bridge}
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const aboutButton = Array.from(rendered.container.querySelectorAll('.nostr-settings-content .nostr-settings-item')).find((item) =>
            (item.textContent || '').trim() === 'About'
        ) as HTMLButtonElement;
        expect(aboutButton).toBeDefined();

        await act(async () => {
            aboutButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const content = rendered.container.textContent || '';
        expect(content).toContain('NIPs soportadas');
        expect(content).toContain('NIP-19');
        expect(content).toContain('NIP-65');
        expect(content).toContain('Caracteristicas');
    });

    test('opens advanced settings section and mounts MapGenerator settings host', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsModal
                mapBridge={bridge}
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const mountedOnOpen = (bridge.mountSettingsPanel as any).mock.calls.some((call: [unknown]) => call[0] instanceof HTMLElement);
        expect(mountedOnOpen).toBe(false);

        const advancedButton = Array.from(rendered.container.querySelectorAll('.nostr-settings-content .nostr-settings-item')).find((item) =>
            (item.textContent || '').trim() === 'Advanced settings'
        ) as HTMLButtonElement;
        expect(advancedButton).toBeDefined();

        await act(async () => {
            advancedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const mountedCalls = (bridge.mountSettingsPanel as any).mock.calls;
        expect(mountedCalls.some((call: [unknown]) => call[0] instanceof HTMLElement)).toBe(true);

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Volver'
        ) as HTMLButtonElement;
        expect(backButton).toBeDefined();

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const callsAfterBack = (bridge.mountSettingsPanel as any).mock.calls;
        expect(callsAfterBack[callsAfterBack.length - 1]?.[0]).toBeNull();
    });

    test('shows zaps settings from main menu and persists edited amounts', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsModal
                mapBridge={bridge}
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const zapsButton = Array.from(rendered.container.querySelectorAll('.nostr-settings-content .nostr-settings-item')).find((item) =>
            (item.textContent || '').trim() === 'Zaps'
        ) as HTMLButtonElement;
        expect(zapsButton).toBeDefined();

        await act(async () => {
            zapsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Cantidad de zaps');
        expect(rendered.container.textContent || '').toContain('21 sats');
        expect(rendered.container.textContent || '').toContain('128 sats');
        expect(rendered.container.textContent || '').toContain('256 sats');

        const addInput = rendered.container.querySelector('input[aria-label="Nueva cantidad de zap"]') as HTMLInputElement;
        const addButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Agregar cantidad')
        ) as HTMLButtonElement;
        expect(addInput).toBeDefined();
        expect(addButton).toBeDefined();

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(addInput, '512');
            addInput.dispatchEvent(new Event('input', { bubbles: true }));
            addInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const raw = window.localStorage.getItem(ZAP_SETTINGS_STORAGE_KEY);
        expect(raw).not.toBeNull();
        expect(raw || '').toContain('512');
    });
});
