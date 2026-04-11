import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MapBridge } from '../map-bridge';
import { MapSettingsDialog } from './MapSettingsDialog';
import { encodeHexToNpub } from '../../nostr/npub';
import { RELAY_SETTINGS_STORAGE_KEY } from '../../nostr/relay-settings';
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

async function waitForCondition(check: () => boolean, timeoutMs: number = 2000): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (check()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
    }

    throw new Error('Condition was not met in time');
}

function getSliderThumb(container: HTMLDivElement, ariaLabel: string): HTMLElement {
    const slider = container.querySelector(`[aria-label="${ariaLabel}"]`);
    if (!slider) {
        throw new Error(`Slider not found for label: ${ariaLabel}`);
    }

    const thumb = slider.querySelector('[role="slider"]') as HTMLElement | null;
    if (!thumb) {
        throw new Error(`Slider thumb not found for label: ${ariaLabel}`);
    }

    return thumb;
}

function createBridgeStub(): MapBridge {
    return {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([]),
        applyOccupancy: vi.fn(),
        setVerifiedBuildingIndexes: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setDialogBuildingHighlight: vi.fn(),
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
    vi.unstubAllGlobals();

    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('MapSettingsDialog UI settings', () => {
    test('shows UI settings section and persists occupied label zoom level', async () => {
        const onUiSettingsChange = vi.fn();
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="ui"
                onClose={() => {}}
                onUiSettingsChange={onUiSettingsChange}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Configured relay');

        const zoomThumb = getSliderThumb(rendered.container, 'Occupied labels zoom level');
        expect(zoomThumb.getAttribute('aria-valuenow')).toBe('8');

        const sliderMarks = Array.from(rendered.container.querySelectorAll('.nostr-ui-slider-marks span')).map((node) => node.textContent || '');
        expect(sliderMarks).toEqual(['1', '8', '20']);

        const streetLabelsToggle = rendered.container.querySelector('button[aria-label="Street labels enabled"]') as HTMLButtonElement;
        expect(streetLabelsToggle).toBeDefined();
        expect(streetLabelsToggle.getAttribute('aria-checked')).toBe('true');

        const verifiedOverlayToggle = rendered.container.querySelector('button[aria-label="Verified buildings overlay enabled"]') as HTMLButtonElement;
        expect(verifiedOverlayToggle).toBeDefined();
        expect(verifiedOverlayToggle.getAttribute('aria-checked')).toBe('false');

        const streetZoomThumb = getSliderThumb(rendered.container, 'Street labels zoom level');
        expect(streetZoomThumb.getAttribute('aria-valuenow')).toBe('10');

        const trafficCountThumb = getSliderThumb(rendered.container, 'Cars in city');
        expect(trafficCountThumb.getAttribute('aria-valuenow')).toBe('12');

        const trafficSpeedThumb = getSliderThumb(rendered.container, 'Cars speed');
        expect(trafficSpeedThumb.getAttribute('aria-valuenow')).toBe('1');

        await act(async () => {
            for (let index = 0; index < 4; index += 1) {
                getSliderThumb(rendered.container, 'Occupied labels zoom level').dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
                );
            }
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
            for (let index = 0; index < 4; index += 1) {
                getSliderThumb(rendered.container, 'Street labels zoom level').dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
                );
            }
        });

        await act(async () => {
            for (let index = 0; index < 10; index += 1) {
                getSliderThumb(rendered.container, 'Cars in city').dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
                );
            }
        });

        await act(async () => {
            for (let index = 0; index < 7; index += 1) {
                getSliderThumb(rendered.container, 'Cars speed').dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
                );
            }
        });

        expect(onUiSettingsChange).toHaveBeenCalled();
        const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw || '{}') as {
            occupiedLabelsZoomLevel?: number;
            streetLabelsEnabled?: boolean;
            verifiedBuildingsOverlayEnabled?: boolean;
            streetLabelsZoomLevel?: number;
            trafficParticlesCount?: number;
            trafficParticlesSpeed?: number;
        };
        expect(parsed.occupiedLabelsZoomLevel).toBe(9);
        expect(parsed.streetLabelsEnabled).toBe(true);
        expect(parsed.verifiedBuildingsOverlayEnabled).toBe(true);
        expect(parsed.streetLabelsZoomLevel).toBe(11);
        expect(parsed.trafficParticlesCount).toBe(13);
        expect(parsed.trafficParticlesSpeed).toBe(1.1);
    });

    test('shows about panel with supported nips and app features', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="about"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('NIPs soportadas');
        expect(content).toContain('NIP-19');
        expect(content).toContain('NIP-65');
        expect(content).toContain('Caracteristicas');
    });

    test('opens advanced settings section and mounts MapGenerator settings host', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="advanced"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const mountedCalls = (bridge.mountSettingsPanel as any).mock.calls;
        expect(mountedCalls.some((call: [unknown]) => call[0] instanceof HTMLElement)).toBe(true);

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Volver'
        );
        expect(backButton).toBeUndefined();
    });

    test('shows zaps settings from main menu and persists edited amounts', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="zaps"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

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

    test('renders relay list in table and removes a relay from context menu action', async () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({ relays: ['wss://relay.one', 'wss://relay.two'] })
        );

        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const relayTable = rendered.container.querySelector('[data-slot="table"]');
        expect(relayTable).toBeDefined();

        const actionsButton = rendered.container.querySelector('button[aria-label="Abrir acciones para wss://relay.one (NIP-65 read+write)"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));
        });

        const removeItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Remove'
        ) as HTMLElement;
        expect(removeItem).toBeDefined();

        await act(async () => {
            removeItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').not.toContain('wss://relay.one');
        expect(rendered.container.textContent || '').toContain('wss://relay.two');

        const raw = window.localStorage.getItem(RELAY_SETTINGS_STORAGE_KEY);
        expect(raw).not.toBeNull();
        expect(raw || '').not.toContain('wss://relay.one');
        expect(raw || '').toContain('wss://relay.two');
    });

    test('uses wider relays layout and shows compact relay metadata in table', async () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({ relays: ['wss://relay.one/socket'] })
        );

        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const dialogContent = rendered.container.querySelector('.nostr-settings-dialog-relays');
        expect(dialogContent).toBeDefined();

        expect(rendered.container.textContent || '').toContain('relay.one');
        expect(rendered.container.textContent || '').toContain('wss');
        expect(rendered.container.textContent || '').not.toContain('Info');

        const closeButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Cerrar'
        ) as HTMLButtonElement;
        expect(closeButton).toBeDefined();

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Volver'
        );
        expect(backButton).toBeUndefined();
    });

    test('separates relay categories in UI and stores relay additions by type', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const relayCategoryTrigger = rendered.container.querySelector('button[aria-label="Relay category"]') as HTMLButtonElement;
        const relayEditor = rendered.container.querySelector('input[aria-label="Relay URLs"]') as HTMLInputElement;
        const addButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Añadir'
        ) as HTMLButtonElement;

        expect(relayCategoryTrigger).toBeDefined();
        expect(relayEditor).toBeDefined();
        expect(addButton).toBeDefined();
        expect(rendered.container.textContent || '').toContain('NIP-65 read+write');
        expect(rendered.container.textContent || '').toContain('NIP-65 read');
        expect(rendered.container.textContent || '').toContain('NIP-65 write');
        expect(rendered.container.textContent || '').toContain('NIP-17 DM inbox');

        await act(async () => {
            relayCategoryTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            relayCategoryTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const dmInboxOption = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'NIP-17 DM inbox'
        ) as HTMLElement;
        expect(dmInboxOption).toBeDefined();

        await act(async () => {
            dmInboxOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(relayEditor, 'wss://relay.dm-inbox-only.example');
            relayEditor.dispatchEvent(new Event('input', { bubbles: true }));
            relayEditor.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const raw = window.localStorage.getItem(RELAY_SETTINGS_STORAGE_KEY);
        expect(raw).not.toBeNull();

        const parsed = JSON.parse(raw || '{}') as {
            byType?: {
                nip65Both?: string[];
                nip65Read?: string[];
                nip65Write?: string[];
                dmInbox?: string[];
            };
        };

        expect(parsed.byType?.dmInbox).toContain('wss://relay.dm-inbox-only.example');
        expect(parsed.byType?.nip65Both || []).not.toContain('wss://relay.dm-inbox-only.example');
        expect(parsed.byType?.nip65Read || []).not.toContain('wss://relay.dm-inbox-only.example');
        expect(parsed.byType?.nip65Write || []).not.toContain('wss://relay.dm-inbox-only.example');
    });

    test('opens relay details dialog from context menu for configured and suggested rows', async () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.one'],
                byType: {
                    nip65Both: ['wss://relay.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            })
        );

        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                suggestedRelays={['wss://relay.suggested.example']}
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const configuredActions = rendered.container.querySelector('button[aria-label="Abrir acciones para wss://relay.one (NIP-65 read+write)"]') as HTMLButtonElement;
        expect(configuredActions).toBeDefined();

        await act(async () => {
            configuredActions.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));
        });

        const detailsConfigured = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Details'
        ) as HTMLElement;
        expect(detailsConfigured).toBeDefined();

        await act(async () => {
            detailsConfigured.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Relay details');
        expect(rendered.container.textContent || '').toContain('wss://relay.one');
        expect(rendered.container.textContent || '').not.toContain('Configured relay');
        expect(rendered.container.textContent || '').not.toContain('Source');

        const detailTable = rendered.container.querySelector('.nostr-relay-detail-table');
        expect(detailTable).toBeDefined();

        const backDetails = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Volver'
        ) as HTMLButtonElement;
        expect(backDetails).toBeDefined();

        await act(async () => {
            backDetails.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const suggestedActions = rendered.container.querySelector('button[aria-label="Abrir acciones sugeridas para wss://relay.suggested.example (NIP-65 read+write)"]') as HTMLButtonElement;
        expect(suggestedActions).toBeDefined();

        await act(async () => {
            suggestedActions.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 28,
                clientY: 28,
            }));
        });

        const detailsSuggested = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Details'
        ) as HTMLElement;
        expect(detailsSuggested).toBeDefined();

        await act(async () => {
            detailsSuggested.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('wss://relay.suggested.example');
    });

    test('shows relay connection status in relay detail table', async () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.one'],
                byType: {
                    nip65Both: ['wss://relay.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            })
        );

        const bridge = createBridgeStub();
        const probeRelayStatus = vi.fn(async (relayUrl: string) => relayUrl === 'wss://relay.one');
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
                relayConnectionProbe={probeRelayStatus}
                relayConnectionRefreshIntervalMs={0}
            />
        );
        mounted.push(rendered);

        await waitForCondition(() => (rendered.container.textContent || '').includes('Conectado'));

        const configuredActions = rendered.container.querySelector('button[aria-label="Abrir acciones para wss://relay.one (NIP-65 read+write)"]') as HTMLButtonElement;
        expect(configuredActions).toBeDefined();

        await act(async () => {
            configuredActions.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));
        });

        const detailsConfigured = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Details'
        ) as HTMLElement;
        expect(detailsConfigured).toBeDefined();

        await act(async () => {
            detailsConfigured.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const detailTable = rendered.container.querySelector('.nostr-relay-detail-table');
        expect(detailTable).toBeDefined();
        expect(detailTable?.textContent || '').toContain('Connection');
        expect(detailTable?.textContent || '').toContain('Conectado');
    });

    test('shows NIP-11 relay detail fields and hides URL-derived transport rows', async () => {
        const adminHex = '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245';
        const adminNpub = encodeHexToNpub(adminHex);

        const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
            name: 'damus.io',
            description: 'Damus strfry relay',
            pubkey: adminHex,
            contact: 'mailto:admin@damus.io',
            software: 'git+https://github.com/hoytech/strfry.git',
            version: '1.0.4',
            supported_nips: [1, 2, 11, 40],
            limitation: {
                auth_required: false,
                payment_required: false,
                restricted_writes: true,
                max_limit: 500,
            },
            terms_of_service: 'https://damus.io/terms',
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        }));
        vi.stubGlobal('fetch', fetchMock);
        (window as any).fetch = fetchMock;

        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.one'],
                byType: {
                    nip65Both: ['wss://relay.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            })
        );

        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        await waitForCondition(() => fetchMock.mock.calls.length > 0);
        await waitForCondition(() => (rendered.container.textContent || '').includes('damus.io'));

        const configuredActions = rendered.container.querySelector('button[aria-label="Abrir acciones para wss://relay.one (NIP-65 read+write)"]') as HTMLButtonElement;
        expect(configuredActions).toBeDefined();

        await act(async () => {
            configuredActions.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));
        });

        const detailsConfigured = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Details'
        ) as HTMLElement;
        expect(detailsConfigured).toBeDefined();

        await act(async () => {
            detailsConfigured.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitForCondition(() => {
            const text = rendered.container.textContent || '';
            return text.includes('Admin pubkey') && text.includes('Software') && text.includes('Supported NIPs');
        });

        const content = rendered.container.textContent || '';
        expect(content).toContain('Admin pubkey');
        expect(content).toContain(adminNpub.slice(0, 24));
        expect(content).not.toContain(adminHex);
        expect(content).toContain('mailto:admin@damus.io');
        expect(content).toContain('git+https://github.com/hoytech/strfry.git');
        expect(content).toContain('NIP-1');
        expect(content).toContain('NIP-11');

        const detailDescription = rendered.container.querySelector('.nostr-relay-detail-description');
        expect(detailDescription).toBeNull();
        const detailTable = rendered.container.querySelector('.nostr-relay-detail-table');
        expect(detailTable?.textContent || '').toContain('Damus strfry relay');

        expect(content).not.toContain('Host');
        expect(content).not.toContain('Protocol');
        expect(content).not.toContain('Port');
        expect(content).not.toContain('Path');
        expect(content).not.toContain('Transport');
    });

    test('keeps loading NIP-11 metadata after opening relay detail quickly', async () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
            await new Promise((resolve) => setTimeout(resolve, 40));
            return new Response(JSON.stringify({
                contact: 'mailto:ops@relay.one',
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        (window as any).fetch = fetchMock;

        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({ relays: ['wss://relay.one'] })
        );

        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const configuredActions = rendered.container.querySelector('button[aria-label="Abrir acciones para wss://relay.one (NIP-65 read+write)"]') as HTMLButtonElement;
        expect(configuredActions).toBeDefined();

        await act(async () => {
            configuredActions.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));
        });

        const detailsConfigured = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Details'
        ) as HTMLElement;
        expect(detailsConfigured).toBeDefined();

        await act(async () => {
            detailsConfigured.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitForCondition(() => fetchMock.mock.calls.length >= 1);
        await waitForCondition(() => (rendered.container.textContent || '').includes('mailto:ops@relay.one'));
        const relayOneCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('https://relay.one'));
        expect(relayOneCalls.length).toBe(1);
        expect(rendered.container.textContent || '').toContain('mailto:ops@relay.one');
    });

    test('renders relay metadata error with shadcn item and icon', async () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response('error', { status: 503 }));
        vi.stubGlobal('fetch', fetchMock);
        (window as any).fetch = fetchMock;

        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.one'],
                byType: {
                    nip65Both: ['wss://relay.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            })
        );

        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const configuredActions = rendered.container.querySelector('button[aria-label="Abrir acciones para wss://relay.one (NIP-65 read+write)"]') as HTMLButtonElement;
        expect(configuredActions).toBeDefined();

        await act(async () => {
            configuredActions.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));
        });

        const detailsConfigured = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Details'
        ) as HTMLElement;
        expect(detailsConfigured).toBeDefined();

        await act(async () => {
            detailsConfigured.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitForCondition(() => (rendered.container.textContent || '').includes('No se pudo obtener metadata remota del relay.'));

        const item = Array.from(rendered.container.querySelectorAll('[data-slot="item"]')).find((node) =>
            (node.textContent || '').includes('No se pudo obtener metadata remota del relay.')
        );
        expect(item).toBeDefined();

        const description = item?.querySelector('[data-slot="item-description"]');
        expect(description).not.toBeNull();
        expect((description?.textContent || '').trim()).toBe('No se pudo obtener metadata remota del relay.');
        expect(item?.querySelector('[data-slot="item-media"] svg')).not.toBeNull();

        const header = rendered.container.querySelector('.nostr-relay-detail-header');
        const tableWrap = rendered.container.querySelector('.nostr-relay-detail-table-wrap');
        expect(header).not.toBeNull();
        expect(tableWrap).not.toBeNull();

        expect(Boolean(header && item && (header.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        expect(Boolean(item && tableWrap && (item.compareDocumentPosition(tableWrap) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    });

    test('does not show suggested relays empty-state hint text', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('No hay relays sugeridos todavia. Carga una npub para intentar descubrirlos via NIP-65 y NIP-17.');
    });

    test('rejects invalid relay hostnames when adding relays', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const relayEditor = rendered.container.querySelector('input[aria-label="Relay URLs"]') as HTMLInputElement;
        const addButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Añadir'
        ) as HTMLButtonElement;

        expect(relayEditor).toBeDefined();
        expect(addButton).toBeDefined();

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(relayEditor, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
            relayEditor.dispatchEvent(new Event('input', { bubbles: true }));
            relayEditor.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Entradas invalidas');
        expect(rendered.container.textContent || '').not.toContain('wss://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

        const raw = window.localStorage.getItem(RELAY_SETTINGS_STORAGE_KEY);
        expect(raw || '').not.toContain('wss://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });

    test('keeps relay input enabled styling when add field is empty', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        const relayEditor = rendered.container.querySelector('input[aria-label="Relay URLs"]') as HTMLInputElement;
        const addButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Añadir'
        ) as HTMLButtonElement;

        expect(relayEditor).toBeDefined();
        expect(addButton).toBeDefined();
        expect(addButton.disabled).toBe(false);

        await act(async () => {
            addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').not.toContain('Entradas invalidas');
    });

    test('shows relay connection summary and per-row connection status in relays table', async () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.general.one', 'wss://relay.inbox.one', 'wss://relay.shared.one', 'wss://relay.outbox.one'],
                byType: {
                    nip65Both: ['wss://relay.general.one'],
                    nip65Read: ['wss://relay.inbox.one', 'wss://relay.shared.one'],
                    nip65Write: ['wss://relay.outbox.one', 'wss://relay.shared.one'],
                    dmInbox: [],
                },
            })
        );

        const bridge = createBridgeStub();
        const probeRelayStatus = vi.fn(async (relayUrl: string) => relayUrl === 'wss://relay.general.one');
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
                relayConnectionProbe={probeRelayStatus}
                relayConnectionRefreshIntervalMs={0}
            />
        );
        mounted.push(rendered);

        await waitForCondition(() => {
            const content = rendered.container.textContent || '';
            return content.includes('Relays configurados: 5') && content.includes('Conectados: 1') && content.includes('Sin conexión: 4');
        });

        expect(rendered.container.textContent || '').toContain('Conectado');
        expect(rendered.container.textContent || '').toContain('Sin conexión');

        const disconnectedBadge = Array.from(rendered.container.querySelectorAll('[data-slot="badge"]')).find((badge) =>
            (badge.textContent || '').includes('Sin conexión')
        ) as HTMLElement | undefined;
        expect(disconnectedBadge).toBeDefined();
        expect(disconnectedBadge?.getAttribute('data-variant')).toBe('destructive');

        expect(probeRelayStatus).toHaveBeenCalledWith('wss://relay.general.one', expect.any(Number));
        expect(probeRelayStatus).toHaveBeenCalledWith('wss://relay.inbox.one', expect.any(Number));
        expect(probeRelayStatus).toHaveBeenCalledWith('wss://relay.shared.one', expect.any(Number));
        expect(probeRelayStatus).toHaveBeenCalledWith('wss://relay.outbox.one', expect.any(Number));
    });

    test('keeps configured relay status stable even with many suggested relay probes', async () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.configured.one'],
                byType: {
                    nip65Both: ['wss://relay.configured.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            })
        );

        let activeProbes = 0;
        const probeRelayStatus = vi.fn(async (relayUrl: string) => {
            activeProbes += 1;

            try {
                await new Promise((resolve) => setTimeout(resolve, 30));

                if (relayUrl === 'wss://relay.configured.one') {
                    return activeProbes === 1;
                }

                return false;
            } finally {
                activeProbes -= 1;
            }
        });

        const bridge = createBridgeStub();
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
                relayConnectionProbe={probeRelayStatus}
                relayConnectionRefreshIntervalMs={0}
                suggestedRelays={[
                    'wss://relay.suggested.one',
                    'wss://relay.suggested.two',
                    'wss://relay.suggested.three',
                    'wss://relay.suggested.four',
                    'wss://relay.suggested.five',
                    'wss://relay.suggested.six',
                ]}
            />
        );
        mounted.push(rendered);

        await waitForCondition(() => {
            const content = rendered.container.textContent || '';
            return content.includes('Relays configurados: 1') && content.includes('Conectados: 1') && content.includes('Sin conexión: 0');
        });

        const configuredActions = rendered.container.querySelector('button[aria-label="Abrir acciones para wss://relay.configured.one (NIP-65 read+write)"]') as HTMLButtonElement | null;
        expect(configuredActions).not.toBeNull();
        const configuredRow = configuredActions?.closest('tr');
        expect(configuredRow?.textContent || '').toContain('Conectado');
    });

    test('renders checking status with shadcn spinner badge', async () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.general.one'],
                byType: {
                    nip65Both: ['wss://relay.general.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            })
        );

        const bridge = createBridgeStub();
        const pendingProbe = vi.fn(
            async () =>
                await new Promise<boolean>(() => {
                    return;
                })
        );
        const rendered = await renderElement(
            <MapSettingsDialog
                mapBridge={bridge}
                initialView="relays"
                onClose={() => {}}
                relayConnectionProbe={pendingProbe}
                relayConnectionRefreshIntervalMs={0}
            />
        );
        mounted.push(rendered);

        await waitForCondition(() => (rendered.container.textContent || '').includes('Comprobando'));

        const checkingBadge = Array.from(rendered.container.querySelectorAll('[data-slot="badge"]')).find((badge) =>
            (badge.textContent || '').includes('Comprobando')
        ) as HTMLElement | undefined;

        expect(checkingBadge).toBeDefined();
        expect(checkingBadge?.getAttribute('data-variant')).toBe('secondary');
        expect(checkingBadge?.querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull();
    });
});
