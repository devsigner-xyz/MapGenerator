import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { RELAY_SETTINGS_STORAGE_KEY } from '../nostr/relay-settings';
import { UI_SETTINGS_STORAGE_KEY } from '../nostr/ui-settings';
import { encodeHexToNpub } from '../nostr/npub';
import { App } from './App';
import type { MapBridge } from './map-bridge';
import type { NostrClient } from '../nostr/types';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface MapBridgeStub {
    bridge: MapBridge;
    triggerOccupiedBuildingClick: (payload: { buildingIndex: number; pubkey: string }) => void;
    triggerOccupiedBuildingContextMenu: (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => void;
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return {
        promise,
        resolve,
        reject,
    };
}

function createMapBridgeStub(buildingsCount = 0): MapBridgeStub {
    const occupiedBuildingClickListeners: Array<(payload: { buildingIndex: number; pubkey: string }) => void> = [];
    const occupiedBuildingContextMenuListeners: Array<
        (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => void
    > = [];
    const bridge = {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue(
            Array.from({ length: buildingsCount }, (_, index) => ({
                index,
                centroid: {
                    x: (index + 1) * 10,
                    y: (index + 1) * 8,
                },
            }))
        ),
        applyOccupancy: vi.fn(),
        setVerifiedBuildingIndexes: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setZoom: vi.fn(),
        setModalBuildingHighlight: vi.fn(),
        setStreetLabelsEnabled: vi.fn(),
        setStreetLabelsZoomLevel: vi.fn(),
        setStreetLabelUsernames: vi.fn(),
        setTrafficParticlesCount: vi.fn(),
        setTrafficParticlesSpeed: vi.fn(),
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn(),
        getParkCount: vi.fn().mockReturnValue(0),
        getZoom: vi.fn().mockReturnValue(1),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockImplementation((listener: (payload: { buildingIndex: number; pubkey: string }) => void) => {
            occupiedBuildingClickListeners.push(listener);
            return () => {
                const index = occupiedBuildingClickListeners.indexOf(listener);
                if (index >= 0) {
                    occupiedBuildingClickListeners.splice(index, 1);
                }
            };
        }),
        onOccupiedBuildingContextMenu: vi.fn().mockImplementation((listener: (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => void) => {
            occupiedBuildingContextMenuListeners.push(listener);
            return () => {
                const index = occupiedBuildingContextMenuListeners.indexOf(listener);
                if (index >= 0) {
                    occupiedBuildingContextMenuListeners.splice(index, 1);
                }
            };
        }),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as MapBridge;

    return {
        bridge,
        triggerOccupiedBuildingClick: (payload: { buildingIndex: number; pubkey: string }) => {
            occupiedBuildingClickListeners.forEach((listener) => listener(payload));
        },
        triggerOccupiedBuildingContextMenu: (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => {
            occupiedBuildingContextMenuListeners.forEach((listener) => listener(payload));
        },
    };
}

async function renderApp(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 40; i++) {
        if (condition()) {
            return;
        }
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });
    }
    throw new Error('Condition was not met in time');
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }

    const htmlElementPrototype = HTMLElement.prototype as HTMLElement & {
        hasPointerCapture?: (pointerId: number) => boolean;
        setPointerCapture?: (pointerId: number) => void;
        releasePointerCapture?: (pointerId: number) => void;
    };

    if (!htmlElementPrototype.hasPointerCapture) {
        htmlElementPrototype.hasPointerCapture = () => false;
    }

    if (!htmlElementPrototype.setPointerCapture) {
        htmlElementPrototype.setPointerCapture = () => {};
    }

    if (!htmlElementPrototype.releasePointerCapture) {
        htmlElementPrototype.releasePointerCapture = () => {};
    }
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

describe('Nostr overlay App', () => {
    test('shows standalone login selector and hides social tabs before session starts', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]');
        const content = rendered.container.textContent || '';

        expect(npubInput).not.toBeNull();
        expect(content).toContain('Accede o explora');
        expect(content).toContain('npub (solo lectura)');
        expect(content).toContain('Metodo de acceso');
        expect(content).not.toContain('Información');
        expect(content).not.toContain('Sigues (0)');
        expect(content).not.toContain('Seguidores (0)');
        expect(content).toContain('Visualize');
        expect(content).not.toContain('Cargar seguidos');
    });

    test('shows profile avatar initials fallback when image fails to load', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: {
                            pubkey: ownerPubkey,
                            displayName: 'Owner',
                            picture: 'https://example.com/avatar.png',
                        },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(rendered.container.textContent || '').not.toContain('Accede o explora');
        expect(rendered.container.textContent || '').not.toContain('Modo solo lectura. Cambia a nsec o extension para habilitar acciones de escritura.');
        expect(rendered.container.textContent || '').toContain('Read Only');

        const avatar = rendered.container.querySelector('.nostr-profile-avatar') as HTMLImageElement;
        expect(avatar).toBeDefined();

        await act(async () => {
            avatar.dispatchEvent(new Event('error'));
        });

        const fallback = rendered.container.querySelector('.nostr-profile-avatar-fallback') as HTMLElement;
        expect(fallback).toBeDefined();
        expect(fallback.textContent || '').toContain('OW');
    });

    test('renders city stats icon button before regenerate and opens stats modal', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        const toolbarButtons = Array.from(rendered.container.querySelectorAll('.nostr-panel-toolbar button')) as HTMLButtonElement[];
        expect(toolbarButtons.length).toBeGreaterThanOrEqual(3);
        expect(toolbarButtons[0].getAttribute('aria-label')).toBe('Abrir estadisticas de la ciudad');
        expect(toolbarButtons[1].getAttribute('aria-label')).toBe('Regenerar mapa');

        const statsButton = rendered.container.querySelector('button[aria-label="Abrir estadisticas de la ciudad"]') as HTMLButtonElement;
        const regenerateButton = rendered.container.querySelector('button[aria-label="Regenerar mapa"]') as HTMLButtonElement;

        expect(statsButton).toBeDefined();
        expect(regenerateButton).toBeDefined();
        expect(regenerateButton.getAttribute('title')).toBe('New map');
        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsButton.getAttribute('title')).toBe('Settings');

        await act(async () => {
            statsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Estadisticas de la ciudad');

        await act(async () => {
            regenerateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(bridge.regenerateMap).toHaveBeenCalledTimes(1);
    });

    test('renders map zoom controls with current zoom level', async () => {
        const { bridge } = createMapBridgeStub();
        (bridge.getZoom as any).mockReturnValue(2.5);
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('2.50x');
    });

    test('applies zoom controls in +1 and -1 steps', async () => {
        const { bridge } = createMapBridgeStub();
        (bridge.getZoom as any).mockReturnValue(4);
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        const zoomInButton = rendered.container.querySelector('button[aria-label="Acercar mapa"]') as HTMLButtonElement;
        const zoomOutButton = rendered.container.querySelector('button[aria-label="Alejar mapa"]') as HTMLButtonElement;
        expect(zoomInButton).toBeDefined();
        expect(zoomOutButton).toBeDefined();

        await act(async () => {
            zoomInButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            zoomOutButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect((bridge.setZoom as any).mock.calls[0][0]).toBe(5);
        expect((bridge.setZoom as any).mock.calls[1][0]).toBe(4);
    });

    test('renders zoom out button before zoom in button', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        const buttons = Array.from(rendered.container.querySelectorAll('.nostr-map-zoom-controls .nostr-map-zoom-button')) as HTMLButtonElement[];
        expect(buttons.length).toBe(2);
        expect(buttons[0].getAttribute('aria-label')).toBe('Alejar mapa');
        expect(buttons[1].getAttribute('aria-label')).toBe('Acercar mapa');
    });

    test('shows owner profile icon buttons and copies npub with success toast', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const { bridge } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const focusButton = rendered.container.querySelector('button[aria-label="Ubicarme en el mapa"]') as HTMLButtonElement;
        const copyButton = rendered.container.querySelector('button[aria-label="Copiar npub"]') as HTMLButtonElement;
        expect(focusButton).toBeDefined();
        expect(copyButton).toBeDefined();
        expect(focusButton.getAttribute('title')).toBe('Locate on map');
        expect(copyButton.getAttribute('title')).toBe('Copy npub');

        await act(async () => {
            copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0][0] as string).startsWith('npub1')).toBe(true);
        await waitFor(() => (rendered.container.textContent || '').includes('npub copiada'));

        await act(async () => {
            focusButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect((bridge.focusBuilding as any).mock.calls.some((call: unknown[]) => call[0] === 0)).toBe(true);
    });

    test('shows locate/copy actions for following rows', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub(6);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const followingTab = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Sigues (1)')
        ) as HTMLButtonElement;
        expect(followingTab).toBeDefined();

        await act(async () => {
            followingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            followingTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const locateFollowingButton = rendered.container.querySelector('button[aria-label="Ubicar Alice en el mapa"]') as HTMLButtonElement;
        const copyFollowingButton = rendered.container.querySelector('button[aria-label="Copiar npub de Alice"]') as HTMLButtonElement;
        expect(locateFollowingButton).toBeDefined();
        expect(copyFollowingButton).toBeDefined();

        const focusCallsBeforeLocate = (bridge.focusBuilding as any).mock.calls.length;
        await act(async () => {
            locateFollowingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect((bridge.focusBuilding as any).mock.calls.length).toBeGreaterThan(focusCallsBeforeLocate);

        await act(async () => {
            copyFollowingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0][0] as string).startsWith('npub1')).toBe(true);
    });

    test('shows map loader stage messages while processing npub', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);

        const followsDeferred = createDeferred<{ ownerPubkey: string; follows: string[]; relayHints: string[] }>();
        const profilesDeferred = createDeferred<Record<string, { pubkey: string; displayName: string }>>();
        const mapDeferred = createDeferred<void>();

        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub(6);
        (bridge.ensureGenerated as any).mockImplementation(() => mapDeferred.promise);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockImplementation(async () => followsDeferred.promise),
                    fetchProfilesFn: vi.fn().mockImplementation(async () => profilesDeferred.promise),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Conectando a relay'));

        await act(async () => {
            followsDeferred.resolve({
                ownerPubkey,
                follows: [followedPubkey],
                relayHints: [],
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Obteniendo datos'));

        await act(async () => {
            profilesDeferred.resolve({
                [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Construyendo mapa'));

        await act(async () => {
            mapDeferred.resolve();
        });
    });

    test('applies occupancy progressively after city is generated', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const follows = Array.from({ length: 8 }, (_, index) => `${(index + 1).toString(16).repeat(64)}`);
        const { bridge } = createMapBridgeStub(20);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows,
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue(
                        Object.fromEntries([
                            [ownerPubkey, { pubkey: ownerPubkey, displayName: 'Owner' }],
                            ...follows.map((pubkey, index) => [pubkey, { pubkey, displayName: `User-${index}` }]),
                        ])
                    ),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (bridge.applyOccupancy as any).mock.calls.length > 1);

        const firstCall = (bridge.applyOccupancy as any).mock.calls[0][0];
        expect(firstCall.byBuildingIndex).toEqual({});
    });

    test('loads profile and followers in tabs after npub submit', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const followerPubkey = 'b'.repeat(64);
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: ['wss://relay.example'],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                                continue;
                            }

                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                                continue;
                            }

                            if (pubkey === followerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Bob' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockImplementation(async ({ onBatch }: { onBatch?: (batch: { newFollowers: string[]; totalFollowers: number; done: boolean }) => Promise<void> | void }) => {
                        await onBatch?.({
                            newFollowers: [followerPubkey],
                            totalFollowers: 1,
                            done: false,
                        });

                        return {
                            followers: [followerPubkey],
                            scannedBatches: 1,
                            complete: true,
                        };
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(rendered.container.textContent || '').toContain('Sigues (1)');
        expect(rendered.container.textContent || '').toContain('Seguidores (1)');

        const followersTab = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Seguidores (1)')
        );
        expect(followersTab).toBeDefined();

        await act(async () => {
            followersTab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            followersTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Bob'));
    });

    test('shows progressive followers loading status after npub submit', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        let resolveFollowers: (() => void) | undefined;

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: ['wss://relay.example'],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                                continue;
                            }

                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockImplementation(async () => {
                        return new Promise((resolve) => {
                            resolveFollowers = () => resolve({
                                followers: [],
                                scannedBatches: 1,
                                complete: true,
                            });
                        });
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(rendered.container.textContent || '').not.toContain('Buscando seguidores en relays');

        await act(async () => {
            resolveFollowers?.();
        });

        await waitFor(() => !(rendered.container.textContent || '').includes('Buscando seguidores en relays'));
    });

    test('shows Read Only badge in expanded sidebar and hides it in compact mode', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub(1);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Read Only'));
        const readOnlyBadge = rendered.container.querySelector('[data-slot="badge"]') as HTMLElement;
        expect(readOnlyBadge).toBeDefined();
        expect(readOnlyBadge.getAttribute('data-variant')).toBe('outline');

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        expect(hidePanelButton).toBeDefined();

        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').not.toContain('Read Only');
    });

    test('opens occupant modal and focuses building after occupied building click event', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));
        expect((bridge.focusBuilding as any).mock.calls[0][0]).toBe(4);
        await waitFor(() => {
            const highlightCalls = (bridge.setModalBuildingHighlight as any).mock.calls;
            return highlightCalls.length > 0 && highlightCalls[highlightCalls.length - 1][0] === 4;
        });

        const closeButton = rendered.container.querySelector('button[aria-label="Cerrar perfil"]') as HTMLButtonElement;
        expect(closeButton).toBeDefined();

        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const latestCalls = (bridge.setModalBuildingHighlight as any).mock.calls;
            return latestCalls.length > 0 && latestCalls[latestCalls.length - 1][0] === undefined;
        });
    });

    test('opens right-click context menu with zap submenu and can open details/settings actions', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Copiar npub'));
        expect(document.body.textContent || '').toContain('Enviar mensaje');
        expect(document.body.textContent || '').toContain('Ver detalles');
        expect(document.body.textContent || '').toContain('Zap');
        expect(document.body.textContent || '').not.toContain('21 sats');
        expect(document.body.textContent || '').not.toContain('128 sats');
        expect(document.body.textContent || '').not.toContain('256 sats');
        expect(document.body.textContent || '').not.toContain('Configurar cantidades');

        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Copiar npub')
        ) as HTMLElement;
        expect(copyItem).toBeDefined();

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0][0] as string).startsWith('npub1')).toBe(true);

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        const detailsItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Ver detalles')
        ) as HTMLElement;
        expect(detailsItem).toBeDefined();

        await act(async () => {
            detailsItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Ultimas publicaciones'));

        expect(document.body.textContent || '').not.toContain('Configurar cantidades');
    });

    test('opens settings modal, mounts map settings from advanced section and shows shortcuts screen', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsButton).toBeDefined();
        expect(settingsButton.getAttribute('title')).toBe('Settings');

        await act(async () => {
            settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const mountedOnOpen = (bridge.mountSettingsPanel as any).mock.calls.some((call: [unknown]) => call[0] instanceof HTMLElement);
        expect(mountedOnOpen).toBe(false);

        const advancedButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Advanced settings')
        ) as HTMLButtonElement;
        expect(advancedButton).toBeDefined();

        await act(async () => {
            advancedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.mountSettingsPanel as any).mock.calls;
            return calls.length > 0 && calls[calls.length - 1][0] instanceof HTMLElement;
        });

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Volver')
        ) as HTMLButtonElement;
        expect(backButton).toBeDefined();
        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const shortcutsButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Shortcuts')
        ) as HTMLButtonElement;

        expect(shortcutsButton).toBeDefined();
        await act(async () => {
            shortcutsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Mantener pulsada la barra espaciadora y arrastrar');
        expect(rendered.container.textContent || '').toContain('Mantener pulsado el wheel del raton y mover el raton');
    });

    test('applies traffic settings on mount and after UI slider updates', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            streetLabelsZoomLevel: 10,
            trafficParticlesCount: 20,
            trafficParticlesSpeed: 1.4,
        }));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        await waitFor(() => {
            const countCalls = (bridge.setTrafficParticlesCount as any).mock.calls;
            const speedCalls = (bridge.setTrafficParticlesSpeed as any).mock.calls;
            return countCalls.length > 0 && speedCalls.length > 0;
        });

        expect((bridge.setTrafficParticlesCount as any)).toHaveBeenCalledWith(20);
        expect((bridge.setTrafficParticlesSpeed as any)).toHaveBeenCalledWith(1.4);

        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        await act(async () => {
            settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const uiButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'UI'
        ) as HTMLButtonElement;
        expect(uiButton).toBeDefined();

        await act(async () => {
            uiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const trafficCountInput = rendered.container.querySelector('input[aria-label="Cars in city"]') as HTMLInputElement;
        const trafficSpeedInput = rendered.container.querySelector('input[aria-label="Cars speed"]') as HTMLInputElement;
        expect(trafficCountInput).toBeDefined();
        expect(trafficSpeedInput).toBeDefined();

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

        expect((bridge.setTrafficParticlesCount as any)).toHaveBeenLastCalledWith(22);
        expect((bridge.setTrafficParticlesSpeed as any)).toHaveBeenLastCalledWith(1.7);
    });

    test('can collapse panel to compact icon row and restore it', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        expect((bridge.setViewportInsetLeft as any).mock.calls[0][0]).toBe(380);

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        expect(hidePanelButton).toBeDefined();
        expect(hidePanelButton.getAttribute('title')).toBe('Hide panel');

        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.querySelector('input[name="npub"]')).toBeNull();
        const showPanelButton = rendered.container.querySelector('button[aria-label="Mostrar panel"]') as HTMLButtonElement;
        expect(showPanelButton).toBeDefined();
        expect(showPanelButton.getAttribute('title')).toBe('Show panel');
        expect(rendered.container.querySelector('button[aria-label="Abrir ajustes"]')).not.toBeNull();
        const compactButtons = Array.from(rendered.container.querySelectorAll('.nostr-compact-toolbar button')) as HTMLButtonElement[];
        expect(compactButtons.length).toBe(4);
        expect(compactButtons[0].getAttribute('aria-label')).toBe('Mostrar panel');
        expect(compactButtons[1].getAttribute('aria-label')).toBe('Abrir ajustes');
        expect(compactButtons[2].getAttribute('aria-label')).toBe('Regenerar mapa');
        expect(compactButtons[3].getAttribute('aria-label')).toBe('Abrir estadisticas de la ciudad');
        expect((bridge.setViewportInsetLeft as any).mock.calls[(bridge.setViewportInsetLeft as any).mock.calls.length - 1][0]).toBe(0);

        await act(async () => {
            showPanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.querySelector('input[name="npub"]')).not.toBeNull();
        expect((bridge.setViewportInsetLeft as any).mock.calls[(bridge.setViewportInsetLeft as any).mock.calls.length - 1][0]).toBe(380);
    });

    test('filters following tab by name or npub and can clear search', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const alicePubkey = 'a'.repeat(64);
        const bobPubkey = 'b'.repeat(64);
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [alicePubkey, bobPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === alicePubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                            if (pubkey === bobPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Bob' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const followingTab = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Sigues (2)')
        ) as HTMLButtonElement;
        expect(followingTab).toBeDefined();

        await act(async () => {
            followingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            followingTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const searchInput = rendered.container.querySelector('input[aria-label="Buscar en seguidos"]') as HTMLInputElement;
        expect(searchInput).toBeDefined();
        const bobNpub = encodeHexToNpub(bobPubkey);

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(searchInput, bobNpub);
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Bob');
        expect(rendered.container.textContent || '').not.toContain('Alice');

        const clearButton = rendered.container.querySelector('button[aria-label="Limpiar busqueda"]') as HTMLButtonElement;
        expect(clearButton).toBeDefined();

        await act(async () => {
            clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));
    });

    test('applies verified building overlay indexes when toggle is enabled', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            verifiedBuildingsOverlayEnabled: true,
            streetLabelsZoomLevel: 10,
            trafficParticlesCount: 12,
            trafficParticlesSpeed: 1,
        }));

        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub(12);

        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                names: {
                    _: followedPubkey,
                },
            }),
        });
        (globalThis as any).fetch = fetchMock;

        try {
            const rendered = await renderApp(
                <App
                    mapBridge={bridge}
                    services={{
                        createClient: () => ({
                            connect: async () => {},
                            fetchLatestReplaceableEvent: async () => null,
                            fetchEvents: async () => [],
                        }),
                        fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [followedPubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                            const profiles: Record<string, { pubkey: string; displayName: string; nip05?: string }> = {};
                            for (const pubkey of pubkeys) {
                                if (pubkey === ownerPubkey) {
                                    profiles[pubkey] = { pubkey, displayName: 'Owner' };
                                }
                                if (pubkey === followedPubkey) {
                                    profiles[pubkey] = { pubkey, displayName: 'Alice', nip05: '_@verified.example' };
                                }
                            }
                            return profiles;
                        }),
                    }}
                />
            );
            mounted.push(rendered);

            const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
            const form = rendered.container.querySelector('form');

            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
                npubInput.dispatchEvent(new Event('input', { bubbles: true }));
                npubInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            await act(async () => {
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
            await waitFor(() => {
                const calls = (bridge.setVerifiedBuildingIndexes as any).mock.calls as number[][];
                return calls.some((call) => Array.isArray(call[0]) && call[0].length > 0);
            });

            expect(fetchMock).toHaveBeenCalled();
        } finally {
            (globalThis as any).fetch = originalFetch;
        }
    });

    test('shows verified nip05 identifiers in profile and following list', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub(6);

        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
            const url = String(input);
            const parsed = new URL(url);
            const name = parsed.searchParams.get('name') || '';
            if (parsed.hostname === 'owner.test' && name === 'owner') {
                return {
                    ok: true,
                    json: async () => ({ names: { owner: ownerPubkey } }),
                };
            }

            if (parsed.hostname === 'alice.test' && name === 'alice') {
                return {
                    ok: true,
                    json: async () => ({ names: { alice: followedPubkey } }),
                };
            }

            return {
                ok: true,
                json: async () => ({ names: {} }),
            };
        });
        (globalThis as any).fetch = fetchMock;

        try {
            const rendered = await renderApp(
                <App
                    mapBridge={bridge}
                    services={{
                        createClient: () => ({
                            connect: async () => {},
                            fetchLatestReplaceableEvent: async () => null,
                            fetchEvents: async () => [],
                        }),
                        fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [followedPubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                            const profiles: Record<string, { pubkey: string; displayName: string; nip05?: string }> = {};
                            for (const pubkey of pubkeys) {
                                if (pubkey === ownerPubkey) {
                                    profiles[pubkey] = { pubkey, displayName: 'Owner', nip05: 'owner@owner.test' };
                                }
                                if (pubkey === followedPubkey) {
                                    profiles[pubkey] = { pubkey, displayName: 'Alice', nip05: 'alice@alice.test' };
                                }
                            }
                            return profiles;
                        }),
                    }}
                />
            );
            mounted.push(rendered);

            const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
            const form = rendered.container.querySelector('form');

            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
                npubInput.dispatchEvent(new Event('input', { bubbles: true }));
                npubInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            await act(async () => {
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
            await waitFor(() => (rendered.container.textContent || '').includes('owner@owner.test'));
            await waitFor(() => Boolean(rendered.container.querySelector('[aria-label="NIP-05 verificado por DNS: owner@owner.test"]')));

            const followingTab = Array.from(rendered.container.querySelectorAll('button')).find(button =>
                (button.textContent || '').includes('Sigues (1)')
            ) as HTMLButtonElement;

            await act(async () => {
                followingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
                followingTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            await waitFor(() => Boolean(rendered.container.querySelector('[aria-label="NIP-05 verificado por DNS: alice@alice.test"]')));
            expect(rendered.container.textContent || '').not.toContain('alice@alice.test');

            await act(async () => {
                triggerOccupiedBuildingClick({
                    buildingIndex: 1,
                    pubkey: followedPubkey,
                });
            });

            await waitFor(() => (rendered.container.textContent || '').includes('alice@alice.test'));
            const modalBadge = rendered.container.querySelector('[aria-label="NIP-05 verificado por DNS: alice@alice.test"]') as HTMLElement;
            expect(modalBadge).toBeDefined();
            expect(modalBadge.getAttribute('title')).toBe('NIP-05 verificado por DNS: alice@alice.test');
        } finally {
            (globalThis as any).fetch = originalFetch;
        }
    });

    test('loads active profile stats and latest posts when occupant modal opens', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const fetchLatestPostsByPubkeyFn = vi.fn().mockResolvedValue({
            posts: [
                {
                    id: 'post-1',
                    pubkey: followedPubkey,
                    createdAt: 1710000000,
                    content: 'Hola mundo',
                },
            ],
            nextUntil: 1709999999,
            hasMore: true,
        });
        const fetchProfileStatsFn = vi.fn().mockResolvedValue({
            followsCount: 12,
            followersCount: 34,
        });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn,
                    fetchProfileStatsFn,
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Hola mundo'));
        expect(rendered.container.textContent || '').toContain('Ultimas publicaciones');
        expect(fetchLatestPostsByPubkeyFn).toHaveBeenCalledWith(expect.objectContaining({ pubkey: followedPubkey }));
        expect(fetchProfileStatsFn).toHaveBeenCalledWith(expect.objectContaining({ pubkey: followedPubkey }));
    });

    test('loads more active profile posts on demand', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const fetchLatestPostsByPubkeyFn = vi
            .fn()
            .mockResolvedValueOnce({
                posts: [
                    {
                        id: 'post-1',
                        pubkey: followedPubkey,
                        createdAt: 1710000000,
                        content: 'Primer lote',
                    },
                ],
                nextUntil: 1709999999,
                hasMore: true,
            })
            .mockResolvedValueOnce({
                posts: [
                    {
                        id: 'post-2',
                        pubkey: followedPubkey,
                        createdAt: 1709999000,
                        content: 'Segundo lote',
                    },
                ],
                nextUntil: 1709998999,
                hasMore: false,
            });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn,
                    fetchProfileStatsFn: vi.fn().mockResolvedValue({ followsCount: 1, followersCount: 1 }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Primer lote'));

        const loadMoreButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Cargar mas')
        ) as HTMLButtonElement;
        expect(loadMoreButton).toBeDefined();

        await act(async () => {
            loadMoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Segundo lote'));
        expect(fetchLatestPostsByPubkeyFn).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                pubkey: followedPubkey,
                until: 1709999999,
            })
        );
    });

    test('uses configured relay settings when creating nostr clients', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        window.localStorage.setItem(RELAY_SETTINGS_STORAGE_KEY, JSON.stringify({ relays: ['wss://relay.one', 'wss://relay.two'] }));

        const clientStub: NostrClient = {
            connect: async () => {},
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async () => [],
        };
        const createClient = vi.fn().mockReturnValue(clientStub);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient,
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(createClient).toHaveBeenCalled();
        expect(createClient.mock.calls[0]?.[0]).toEqual(['wss://relay.one', 'wss://relay.two']);
    });

    test('keeps profile posts visible when stats request fails', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn: vi.fn().mockResolvedValue({
                        posts: [{ id: 'post-a', pubkey: followedPubkey, createdAt: 1710000000, content: 'post disponible' }],
                        nextUntil: 1709999999,
                        hasMore: false,
                    }),
                    fetchProfileStatsFn: vi.fn().mockRejectedValue(new Error('stats failed')),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('post disponible'));
    });

    test('shows who the active profile follows and who follows them', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const followA = 'b'.repeat(64);
        const followB = 'c'.repeat(64);
        const followerA = 'd'.repeat(64);
        const followerB = 'e'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (pubkey: string) => {
                            if (pubkey === followedPubkey) {
                                return {
                                    id: 'kind3',
                                    pubkey,
                                    kind: 3,
                                    created_at: 111,
                                    tags: [['p', followA], ['p', followB]],
                                    content: '',
                                };
                            }
                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn: vi.fn().mockResolvedValue({
                        posts: [],
                        hasMore: false,
                    }),
                    fetchProfileStatsFn: vi.fn().mockResolvedValue({
                        followsCount: 2,
                        followersCount: 2,
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [followerA, followerB],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Sigue a'));
        expect(rendered.container.textContent || '').toContain(`User-${followA.slice(0, 4)}`);
        expect(rendered.container.textContent || '').toContain(`User-${followerA.slice(0, 4)}`);
    });

    test('shows NIP-65 suggested relays in settings', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (_pubkey: string, kind: number) => {
                            if (kind === 10002) {
                                return {
                                    id: 'relay-list',
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 123,
                                    tags: [['r', 'wss://relay.suggested.example']],
                                    content: '',
                                };
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        await act(async () => {
            settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const relaysButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Relays')
        ) as HTMLButtonElement;
        await act(async () => {
            relaysButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('relay.suggested.example'));
    });

    test('hides already-added relays from suggested list', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({ relays: ['wss://relay.suggested.example'] })
        );

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (_pubkey: string, kind: number) => {
                            if (kind === 10002) {
                                return {
                                    id: 'relay-list',
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 123,
                                    tags: [['r', 'wss://relay.suggested.example']],
                                    content: '',
                                };
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        await act(async () => {
            settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const relaysButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Relays')
        ) as HTMLButtonElement;
        await act(async () => {
            relaysButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() =>
            (rendered.container.textContent || '').includes('Todos los relays sugeridos ya estan agregados.')
        );

        const addAllButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Agregar todos')
        );
        expect(addAllButton).toBeUndefined();
    });

    test('shows extension prompt close errors as sonner toast instead of inline sidebar error', async () => {
        (window as any).nostr = {
            getPublicKey: vi.fn().mockRejectedValue(new Error('Prompt was closed')),
            signEvent: vi.fn(),
        };

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        const methodSelectTrigger = rendered.container.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement;
        expect(methodSelectTrigger).toBeDefined();

        await act(async () => {
            methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const extensionMethodOption = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).find((item) =>
            (item.textContent || '').includes('Extension (NIP-07)')
        ) as HTMLElement;
        expect(extensionMethodOption).toBeDefined();

        await act(async () => {
            extensionMethodOption.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            extensionMethodOption.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const continueButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Continuar con extension')
        ) as HTMLButtonElement;
        expect(continueButton).toBeDefined();

        await act(async () => {
            continueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Prompt was closed'));
        expect(rendered.container.querySelector('.nostr-error')).toBeNull();

        delete (window as any).nostr;
    });

    test('allows logout from settings modal', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Información'));

        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        await act(async () => {
            settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Cerrar sesión'));

        const logoutButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Cerrar sesión')
        ) as HTMLButtonElement;
        expect(logoutButton).toBeDefined();

        await act(async () => {
            logoutButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Accede o explora'));

        const content = rendered.container.textContent || '';
        expect(content).not.toContain('Información');
        expect(content).not.toContain('Sigues (1)');
        expect(content).not.toContain('Seguidores (0)');
    });
});
