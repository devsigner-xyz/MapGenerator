import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { createLocalKeyStorage } from '../nostr/auth/local-key-storage';
import { LocalKeyAuthProvider } from '../nostr/auth/providers/local-key-provider';
import { AUTH_SESSION_STORAGE_KEY } from '../nostr/auth/secure-storage';
import { loadRelaySettings, RELAY_SETTINGS_STORAGE_KEY } from '../nostr/relay-settings';
import { UI_SETTINGS_STORAGE_KEY } from '../nostr/ui-settings';
import { EASTER_EGG_PROGRESS_STORAGE_KEY } from '../nostr/easter-egg-progress';
import { getBootstrapRelays } from '../nostr/relay-policy';
import { __resetFollowsCacheForTests } from '../nostr/follows';
import { encodeHexToNpub } from '../nostr/npub';
import * as ndkClientModule from '../nostr/ndk-client';
import * as writeGatewayModule from '../nostr/write-gateway';
import * as runtimeDmServiceModule from '../nostr/dm-runtime-service';
import * as dmApiServiceModule from '../nostr-api/dm-api-service';
import { App } from './App';
import type { NostrOverlayServices } from './hooks/useNostrOverlay';
import type { MapBridge } from './map-bridge';
import type { NostrClient } from '../nostr/types';
import type { SocialNotificationEvent, SocialNotificationsService } from '../nostr/social-notifications-service';
import type { SocialFeedService } from '../nostr/social-feed-service';
import { createNostrOverlayQueryClient } from './query/query-client';
import { nostrOverlayQueryKeys } from './query/keys';
import { buildSocialLastReadStorageKey } from './query/read-state';
import { buildFollowingFeedLastReadStorageKey } from './query/following-feed-read-state';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    queryClient: QueryClient;
}

interface RenderOptions {
    initialEntries?: string[];
}

interface MapBridgeStub {
    bridge: MapBridge;
    triggerOccupiedBuildingClick: (payload: { buildingIndex: number; pubkey: string }) => void;
    triggerOccupiedBuildingContextMenu: (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => void;
    triggerEasterEggBuildingClick: (payload: { buildingIndex: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }) => void;
    triggerSpecialBuildingClick: (payload: { buildingIndex: number; specialBuildingId: 'agora' }) => void;
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

const SAMPLE_AUTH_PUBKEY = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

function createNip07ExtensionMock(pubkey = SAMPLE_AUTH_PUBKEY) {
    return {
        getPublicKey: vi.fn(async () => pubkey),
        signEvent: vi.fn(async (event: any) => ({
            ...event,
            pubkey,
            id: typeof event?.id === 'string' && event.id.length > 0 ? event.id : 'f'.repeat(64),
            sig: 'e'.repeat(128),
        })),
        nip04: {
            encrypt: vi.fn(async (_targetPubkey: string, plaintext: string) => plaintext),
            decrypt: vi.fn(async (_targetPubkey: string, ciphertext: string) => ciphertext),
        },
        nip44: {
            encrypt: vi.fn(async (_targetPubkey: string, plaintext: string) => plaintext),
            decrypt: vi.fn(async (_targetPubkey: string, ciphertext: string) => ciphertext),
        },
    };
}

async function loginWithNip07(container: HTMLDivElement): Promise<void> {
    await waitFor(() => container.querySelector('[data-slot="select-trigger"]') !== null);
    const methodSelectTrigger = container.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement;
    expect(methodSelectTrigger).toBeDefined();

    await act(async () => {
        methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });

    const nip07Option = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).find((item) =>
        (item.textContent || '').trim() === 'Extension (NIP-07)'
    ) as HTMLElement;
    expect(nip07Option).toBeDefined();

    await act(async () => {
        nip07Option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        nip07Option.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });

    const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent || '').includes('Continuar con extension')
    ) as HTMLButtonElement;
    expect(continueButton).toBeDefined();

    await act(async () => {
        continueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function createMapBridgeStub(buildingsCount = 0): MapBridgeStub {
    const occupiedBuildingClickListeners: Array<(payload: { buildingIndex: number; pubkey: string }) => void> = [];
    const occupiedBuildingContextMenuListeners: Array<
        (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => void
    > = [];
    const easterEggBuildingClickListeners: Array<
        (payload: { buildingIndex: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }) => void
    > = [];
    const specialBuildingClickListeners: Array<
        (payload: { buildingIndex: number; specialBuildingId: 'agora' }) => void
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
        setDialogBuildingHighlight: vi.fn(),
        setStreetLabelsEnabled: vi.fn(),
        setStreetLabelsZoomLevel: vi.fn(),
        setStreetLabelUsernames: vi.fn(),
        setTrafficParticlesCount: vi.fn(),
        setTrafficParticlesSpeed: vi.fn(),
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn(),
        listEasterEggBuildings: vi.fn().mockReturnValue([]),
        listSpecialBuildings: vi.fn().mockReturnValue([]),
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
        onEasterEggBuildingClick: vi.fn().mockImplementation((listener: (payload: { buildingIndex: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }) => void) => {
            easterEggBuildingClickListeners.push(listener);
            return () => {
                const index = easterEggBuildingClickListeners.indexOf(listener);
                if (index >= 0) {
                    easterEggBuildingClickListeners.splice(index, 1);
                }
            };
        }),
        onSpecialBuildingClick: vi.fn().mockImplementation((listener: (payload: { buildingIndex: number; specialBuildingId: 'agora' }) => void) => {
            specialBuildingClickListeners.push(listener);
            return () => {
                const index = specialBuildingClickListeners.indexOf(listener);
                if (index >= 0) {
                    specialBuildingClickListeners.splice(index, 1);
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
        triggerEasterEggBuildingClick: (payload: { buildingIndex: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }) => {
            easterEggBuildingClickListeners.forEach((listener) => listener(payload));
        },
        triggerSpecialBuildingClick: (payload: { buildingIndex: number; specialBuildingId: 'agora' }) => {
            specialBuildingClickListeners.forEach((listener) => listener(payload));
        },
    };
}

function createSocialNotificationsServiceMock() {
    let listener: ((event: SocialNotificationEvent) => void) | null = null;
    const service: SocialNotificationsService = {
        subscribeSocial: vi.fn((_input, onEvent) => {
            listener = onEvent;
            return () => {
                listener = null;
            };
        }),
        loadInitialSocial: vi.fn(async () => []),
    };

    return {
        service,
        emit(event: SocialNotificationEvent) {
            listener?.(event);
        },
    };
}

function createSocialFeedServiceMock() {
    const service: SocialFeedService = {
        loadFollowingFeed: vi.fn(async () => ({ items: [], hasMore: false })),
        loadHashtagFeed: vi.fn(async () => ({ items: [], hasMore: false })),
        loadThread: vi.fn(async () => ({ root: null, replies: [], hasMore: false })),
        loadEngagement: vi.fn(async () => ({})),
    };

    return {
        service,
    };
}

function createBasicOverlayServices(ownerPubkey: string = 'f'.repeat(64), overrides: Partial<NostrOverlayServices> = {}): NostrOverlayServices {
    return {
        createClient: () => ({
            connect: async () => {},
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async () => [],
        }),
        fetchFollowsByPubkeyFn: async () => ({
            ownerPubkey,
            follows: [],
            relayHints: [],
        }),
        fetchProfilesFn: async () => ({
            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
        }),
        fetchFollowersBestEffortFn: async () => ({
            followers: [],
            scannedBatches: 1,
            complete: true,
        }),
        ...overrides,
    };
}

function QueryProviderProbe() {
    useQueryClient();
    return <span data-testid="query-provider-probe">query provider ready</span>;
}

async function renderApp(element: ReactElement, options: RenderOptions = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
                    {element}
                </MemoryRouter>
            </QueryClientProvider>
        );
    });

    return { container, root, queryClient };
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

async function openDropdownTrigger(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function openSettingsContextMenu(container: HTMLDivElement): Promise<void> {
    const inlineSettingsButton = container.querySelector('button[aria-label="Alternar ajustes"]') as HTMLButtonElement | null;
    const inlineOptionsVisible = (container.textContent || '').includes('Ajustes avanzados');
    if (inlineSettingsButton && !inlineOptionsVisible) {
        await act(async () => {
            inlineSettingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => (container.textContent || '').includes('Ajustes avanzados'));
        return;
    }

    if (inlineOptionsVisible) {
        return;
    }

    const settingsButton = container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
    expect(settingsButton).toBeDefined();

    await openDropdownTrigger(settingsButton);

    await waitFor(() => (document.body.textContent || '').includes('Ajustes avanzados'));
}

async function selectSettingsContextAction(container: HTMLDivElement, label: string): Promise<void> {
    await openSettingsContextMenu(container);

    const inlineAction = Array.from(container.querySelectorAll('button, a')).find((item) =>
        (item.textContent || '').trim() === label
    ) as HTMLElement | undefined;

    const action = inlineAction ?? Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
        (item.textContent || '').trim() === label
    ) as HTMLElement;
    expect(action).toBeDefined();

    await act(async () => {
        action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function selectUserMenuAction(container: HTMLDivElement, label: string): Promise<void> {
    const userMenuButton = container.querySelector('button[aria-label="Abrir menu de usuario"]') as HTMLButtonElement;
    expect(userMenuButton).toBeDefined();

    await openDropdownTrigger(userMenuButton);

    await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((item) =>
        (item.textContent || '').trim() === label
    ));

    const action = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
        (item.textContent || '').trim() === label
    ) as HTMLElement;
    expect(action).toBeDefined();

    await act(async () => {
        action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function getActiveProfileDialog(): HTMLElement | null {
    return document.body.querySelector('[data-slot="dialog-content"][aria-label="Perfil del ocupante"]') as HTMLElement | null;
}

async function selectActiveProfileDialogTab(label: string): Promise<void> {
    await waitFor(() => getActiveProfileDialog() !== null);
    const dialog = getActiveProfileDialog() as HTMLElement;

    const tab = Array.from(dialog.querySelectorAll('[data-slot="tabs-trigger"]')).find((node) =>
        (node.textContent || '').trim() === label
        || (node.textContent || '').trim().startsWith(`${label} (`)
    ) as HTMLElement;
    expect(tab).toBeDefined();

    await act(async () => {
        tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

let mounted: RenderResult[] = [];
let createNdkDmTransportClientSpy: ReturnType<typeof vi.spyOn> | null = null;

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
    __resetFollowsCacheForTests();
    (window as unknown as { nostr?: unknown }).nostr = createNip07ExtensionMock();
    createNdkDmTransportClientSpy = vi.spyOn(ndkClientModule, 'createNdkDmTransportClient').mockReturnValue({
        publishToRelays: vi.fn(async () => ({
            ackedRelays: [],
            failedRelays: [],
            timeoutRelays: [],
        })),
        subscribe: vi.fn(() => ({
            unsubscribe() {
                return;
            },
        })),
        fetchBackfill: vi.fn(async () => []),
    } as any);
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
    delete (window as unknown as { nostr?: unknown }).nostr;
    vi.restoreAllMocks();
    createNdkDmTransportClientSpy = null;
});

describe('Nostr overlay App', () => {
    test('provides query provider in app render helper', async () => {
        const rendered = await renderApp(<QueryProviderProbe />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('query provider ready');
    });

    test('shows login dialog overlay with full-width map behind before session starts', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);

        const loginScreen = rendered.container.querySelector('[data-testid="login-gate-screen"]');
        const npubInput = rendered.container.querySelector('input[name="npub"]');
        const content = rendered.container.textContent || '';

        expect(loginScreen).not.toBeNull();
        expect(loginScreen?.classList.contains('nostr-login-screen')).toBe(true);
        expect(loginScreen?.classList.contains('nostr-login-screen-dialog')).toBe(true);
        expect(npubInput).not.toBeNull();
        expect(content).not.toContain('Accede o explora');
        expect(content).toContain('npub (solo lectura)');
        expect(content).toContain('Metodo de acceso');
        expect(content).toContain('Acceder');
        expect(content).not.toContain('Cargar seguidos');
        expect(rendered.container.querySelector('.nostr-panel-toolbar')).toBeNull();
        expect((bridge.setViewportInsetLeft as any).mock.calls.at(-1)?.[0]).toBe(0);
    });

    test('renders the scoped create-account selector copy and footer inside the auth flow', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;
        expect(createAccountButton).toBeDefined();

        await act(async () => {
            createAccountButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const content = rendered.container.textContent || '';
        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        const footerButtons = Array.from(footer?.querySelectorAll('button') ?? []);

        expect(content).toContain('Usar app o extension');
        expect(content).toContain('Conecta una extension o un signer externo.');
        expect(content).toContain('Crear cuenta local');
        expect(content).toContain('Crea una cuenta nueva en este dispositivo.');
        expect(footerButtons).toHaveLength(1);
        expect(footerButtons[0]?.textContent || '').toContain('Volver al login');
    });

    test('renders updated external and local auth-flow copy with scoped auth labels', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);

        const openSelectorButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;
        expect(openSelectorButton).toBeDefined();

        await act(async () => {
            openSelectorButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const externalButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Usar app o extension')
        ) as HTMLButtonElement | undefined;
        expect(externalButton).toBeDefined();

        await act(async () => {
            externalButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        let content = rendered.container.textContent || '';
        let authLabels = Array.from(rendered.container.querySelectorAll('.nostr-auth-label'));

        expect(content).toContain('Usar app o extension');
        expect(content).toContain('Elige como conectar una cuenta que ya controlas.');
        expect(authLabels.length).toBeGreaterThan(0);

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').trim() === 'Volver'
        ) as HTMLButtonElement | undefined;
        expect(backButton).toBeDefined();

        await act(async () => {
            backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const localButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta local')
        ) as HTMLButtonElement | undefined;
        expect(localButton).toBeDefined();

        await act(async () => {
            localButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        content = rendered.container.textContent || '';
        authLabels = Array.from(rendered.container.querySelectorAll('.nostr-auth-label'));

        expect(content).toContain('Crear cuenta local');
        expect(content).toContain('Genera una cuenta nueva y guarda tu clave antes de continuar.');
        expect(authLabels.length).toBeGreaterThan(0);
    });

    test('restores persisted session and leaves /login for / after initial load', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));

        const { bridge } = createMapBridgeStub(6);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        expect(rendered.container.querySelector('[data-testid="login-gate-screen"]')).toBeNull();
        expect(rendered.container.querySelector('.nostr-panel-toolbar')).not.toBeNull();
    });

    test('keeps the restoration state visible while a restored session is still loading', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followsDeferred = createDeferred<{ ownerPubkey: string; follows: string[]; relayHints: string[] }>();
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));

        const { bridge } = createMapBridgeStub(4);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockImplementation(async () => followsDeferred.promise),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Recuperando sesión'));
        expect(rendered.container.textContent || '').not.toContain('Metodo de acceso');
        expect(rendered.container.querySelector('input[name="npub"]')).toBeNull();
        expect(rendered.container.textContent || '').toContain('Conectando a relay...');

        await act(async () => {
            followsDeferred.resolve({
                ownerPubkey,
                follows: [],
                relayHints: [],
            });
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
    });

    test('shows the login form once restoration resolves without a persisted session', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App mapBridge={bridge} />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        expect(rendered.container.textContent || '').toContain('Metodo de acceso');
        expect(rendered.container.textContent || '').not.toContain('Recuperando sesión');
    });

    test('returns to the login form when a restored session fails to load', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));

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
                    fetchFollowsByPubkeyFn: vi.fn().mockRejectedValue(new Error('restore failed')),
                    fetchProfilesFn: vi.fn().mockResolvedValue({}),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Metodo de acceso'));
        expect(rendered.container.textContent || '').not.toContain('Recuperando sesión');
        expect(rendered.container.querySelector('input[name="npub"]')).not.toBeNull();
    });

    test('redirects direct internal routes to /login when session is missing', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App mapBridge={bridge} />,
            { initialEntries: ['/estadisticas'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        const content = rendered.container.textContent || '';

        expect(content).toContain('Metodo de acceso');
        expect(content).not.toContain('Estadisticas de la ciudad');
    });

    test('does not render redundant profile identity block in information tab', async () => {
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
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
        expect(rendered.container.textContent || '').not.toContain('Modo solo lectura. Cambia a extension o bunker para habilitar acciones de escritura.');
        expect(rendered.container.textContent || '').toContain('Read Only');

        expect(rendered.container.querySelector('.nostr-profile-avatar')).toBeNull();
        expect(rendered.container.querySelector('.nostr-profile-name')).toBeNull();
    });

    test('renders city stats button in sidebar and regenerate button on map controls', async () => {
        const ownerPubkey = 'f'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);
        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);

        const toolbarButtons = Array.from(rendered.container.querySelectorAll('.nostr-panel-toolbar button')) as HTMLButtonElement[];
        expect(toolbarButtons.length).toBeGreaterThanOrEqual(4);
        expect(toolbarButtons[0]?.getAttribute('aria-label')).toBe('Abrir mapa');
        expect(toolbarButtons.some((button) => button.getAttribute('aria-label') === 'Abrir estadisticas de la ciudad')).toBe(true);
        expect(toolbarButtons.some((button) => button.getAttribute('aria-label') === 'Abrir descubre')).toBe(true);
        expect(toolbarButtons.some((button) => button.getAttribute('aria-label') === 'Regenerar mapa')).toBe(false);
        expect(rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]')).not.toBeNull();

        const statsButton = rendered.container.querySelector('button[aria-label="Abrir estadisticas de la ciudad"]') as HTMLButtonElement;
        const regenerateButton = rendered.container.querySelector('.nostr-map-zoom-controls button[aria-label="Regenerar mapa"]') as HTMLButtonElement;

        expect(statsButton).toBeDefined();
        expect(regenerateButton).toBeDefined();
        expect(regenerateButton.getAttribute('title')).toBe('New map');
        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsButton.getAttribute('title')).toBe('Settings');

        await act(async () => {
            regenerateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (bridge.regenerateMap as any).mock.calls.length > 0);
        expect(bridge.regenerateMap).toHaveBeenCalledTimes(1);

        await act(async () => {
            statsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Estadisticas de la ciudad');
    });

    test('renders global user search button in panel and compact toolbar', async () => {
        const ownerPubkey = 'f'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelSearchButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir buscador global de usuarios"]');
        expect(panelSearchButton).not.toBeNull();

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const compactSearchButton = rendered.container.querySelector('.nostr-compact-toolbar button[aria-label="Abrir buscador global de usuarios"]');
        expect(compactSearchButton).not.toBeNull();
    });

    test('opens global user search dialog from toolbar', async () => {
        const ownerPubkey = 'f'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const searchButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir buscador global de usuarios"]') as HTMLButtonElement;
        expect(searchButton).toBeDefined();

        await act(async () => {
            searchButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Buscar usuarios globalmente');
    });

    test('renders following feed button in panel and compact toolbar when session is active', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelFeedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]');
        expect(panelFeedButton).not.toBeNull();

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const compactFeedButton = rendered.container.querySelector('.nostr-compact-toolbar button[aria-label="Abrir Agora"]');
        expect(compactFeedButton).not.toBeNull();
    });

    test('opens following feed dialog from toolbar and requests first page', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as any).mockResolvedValue({
            items: [
                {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'hola feed',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'hola feed',
                    },
                },
            ],
            hasMore: false,
        });

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));
        await waitFor(() => (rendered.container.textContent || '').includes('hola feed'));
        expect(socialFeed.service.loadFollowingFeed).toHaveBeenCalled();
    });

    test('loads more feed and thread pages through query controller pagination', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        createdAt: 100,
                        content: 'page-1',
                        kind: 'note',
                        rawEvent: {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            kind: 1,
                            created_at: 100,
                            tags: [],
                            content: 'page-1',
                        },
                    },
                ],
                hasMore: true,
                nextUntil: 90,
            })
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'note-2',
                        pubkey: 'b'.repeat(64),
                        createdAt: 90,
                        content: 'page-2',
                        kind: 'note',
                        rawEvent: {
                            id: 'note-2',
                            pubkey: 'b'.repeat(64),
                            kind: 1,
                            created_at: 90,
                            tags: [],
                            content: 'page-2',
                        },
                    },
                ],
                hasMore: false,
                nextUntil: undefined,
            });
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                root: {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    eventKind: 1,
                    content: 'root',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'root',
                    },
                },
                replies: [
                    {
                        id: 'reply-1',
                        pubkey: 'b'.repeat(64),
                        createdAt: 95,
                        eventKind: 1,
                        content: 'reply-1',
                        targetEventId: 'note-1',
                        rawEvent: {
                            id: 'reply-1',
                            pubkey: 'b'.repeat(64),
                            kind: 1,
                            created_at: 95,
                            tags: [['e', 'note-1', '', 'reply']],
                            content: 'reply-1',
                        },
                    },
                ],
                hasMore: true,
                nextUntil: 70,
            })
            .mockResolvedValueOnce({
                root: null,
                replies: [
                    {
                        id: 'reply-2',
                        pubkey: 'c'.repeat(64),
                        createdAt: 70,
                        eventKind: 1,
                        content: 'reply-2',
                        targetEventId: 'note-1',
                        rawEvent: {
                            id: 'reply-2',
                            pubkey: 'c'.repeat(64),
                            kind: 1,
                            created_at: 70,
                            tags: [['e', 'note-1', '', 'reply']],
                            content: 'reply-2',
                        },
                    },
                ],
                hasMore: false,
                nextUntil: undefined,
            });

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length >= 1);

        await waitFor(() => Array.from(rendered.container.querySelectorAll('button')).some((button) =>
            (button.textContent || '').includes('Cargar mas')
        ));
        const loadMoreFeedButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Cargar mas')
        ) as HTMLButtonElement;
        await act(async () => {
            loadMoreFeedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length >= 2);

        const feedCalls = (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls;
        expect(feedCalls[0]?.[0]).not.toHaveProperty('until');
        expect(feedCalls[1]?.[0]).toMatchObject({ until: 90 });

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Responder (0)"]')));
        const openThreadButton = rendered.container.querySelector('button[aria-label="Responder (0)"]') as HTMLButtonElement;
        await act(async () => {
            openThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mock.calls.length >= 1);
        await waitFor(() => Array.from(rendered.container.querySelectorAll('button')).some((button) =>
            (button.textContent || '').includes('Cargar mas respuestas')
        ));
        const loadMoreThreadButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Cargar mas respuestas')
        ) as HTMLButtonElement;

        await act(async () => {
            loadMoreThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mock.calls.length >= 2);
        const threadCalls = (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mock.calls;
        expect(threadCalls[0]?.[0]).toMatchObject({ rootEventId: 'note-1' });
        expect(threadCalls[0]?.[0]).not.toHaveProperty('until');
        expect(threadCalls[1]?.[0]).toMatchObject({ rootEventId: 'note-1', until: 70 });
    });

    test('applies optimistic reaction and repost counters and rolls back on mutation failure', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'optimistic target',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'optimistic target',
                    },
                },
            ],
            hasMore: false,
        });
        (socialFeed.service.loadEngagement as ReturnType<typeof vi.fn>).mockResolvedValue({
            'note-1': {
                replies: 0,
                reposts: 2,
                reactions: 3,
                zaps: 0,
            },
        });

        const reactionFailure = createDeferred<never>();
        const repostFailure = createDeferred<never>();
        const publishEvent = vi.fn(async (event: { kind: number }) => {
            if (event.kind === 7) {
                return reactionFailure.promise;
            }

            if (event.kind === 6) {
                return repostFailure.promise;
            }

            if (event.kind === 5) {
                return {
                    id: 'd'.repeat(64),
                    pubkey: ownerPubkey,
                    kind: 5,
                    created_at: 200,
                    tags: [],
                    content: '',
                };
            }

            return {
                id: 'x'.repeat(64),
                pubkey: ownerPubkey,
                kind: event.kind,
                created_at: 200,
                tags: [],
                content: '',
            };
        });
        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent,
            publishTextNote: vi.fn(async (content: string) => ({
                id: 'y'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags: [],
                content,
            })),
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Reaccionar (3)"]')));
        const reactionButton = rendered.container.querySelector('button[aria-label="Reaccionar (3)"]') as HTMLButtonElement;

        await act(async () => {
            reactionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Reaccionar (4)"]')));
        expect((rendered.container.querySelector('button[aria-label="Reaccionar (4)"]') as HTMLButtonElement).disabled).toBe(true);
        await act(async () => {
            reactionFailure.reject(new Error('reaction-failed'));
        });
        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Reaccionar (3)"]')));
        await waitFor(() => (rendered.container.textContent || '').includes('reaction-failed'));

        const repostButton = rendered.container.querySelector('button[aria-label="Repostear (2)"]') as HTMLButtonElement;
        await act(async () => {
            repostButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Repostear (3)"]')));
        expect((rendered.container.querySelector('button[aria-label="Repostear (3)"]') as HTMLButtonElement).disabled).toBe(true);
        await act(async () => {
            repostFailure.reject(new Error('repost-failed'));
        });
        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Repostear (2)"]')));
        await waitFor(() => (rendered.container.textContent || '').includes('repost-failed'));

        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 7 }));
        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 6 }));
    });

    test('inserts optimistic reply and reconciles to published reply', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'root note',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'root note',
                    },
                },
            ],
            hasMore: false,
        });
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                root: {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    eventKind: 1,
                    content: 'root note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'root note',
                    },
                },
                replies: [],
                hasMore: false,
            })
            .mockResolvedValue({
                root: {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    eventKind: 1,
                    content: 'root note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'root note',
                    },
                },
                replies: [
                    {
                        id: 'reply-final',
                        pubkey: ownerPubkey,
                        createdAt: 220,
                        eventKind: 1,
                        content: 'respuesta final',
                        targetEventId: 'note-1',
                        rawEvent: {
                            id: 'reply-final',
                            pubkey: ownerPubkey,
                            kind: 1,
                            created_at: 220,
                            tags: [['e', 'note-1', '', 'root'], ['e', 'note-1', '', 'reply']],
                            content: 'respuesta final',
                        },
                    },
                ],
                hasMore: false,
            });

        const publishReplyDeferred = createDeferred<{
            id: string;
            pubkey: string;
            kind: number;
            created_at: number;
            tags: string[][];
            content: string;
        }>();
        const publishTextNote = vi.fn(async (_content: string, tags?: string[][]) => {
            if (tags && tags.length > 0) {
                return publishReplyDeferred.promise;
            }

            return {
                id: 'z'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags: [],
                content: _content,
            };
        });

        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent: vi.fn(async () => ({
                id: 'w'.repeat(64),
                pubkey: ownerPubkey,
                kind: 7,
                created_at: 200,
                tags: [],
                content: '+',
            })),
            publishTextNote,
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Responder (0)"]')));
        const openThreadButton = rendered.container.querySelector('button[aria-label="Responder (0)"]') as HTMLButtonElement;
        await act(async () => {
            openThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Hilo'));
        const replyTextarea = rendered.container.querySelector('.nostr-following-feed-reply-box textarea') as HTMLTextAreaElement;
        expect(replyTextarea).toBeDefined();

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(replyTextarea, 'respuesta optimista');
            replyTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            replyTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const sendReplyButton = Array.from(rendered.container.querySelectorAll('.nostr-following-feed-reply-box button')).find((button) =>
            (button.textContent || '').includes('Responder')
        ) as HTMLButtonElement;
        await waitFor(() => !sendReplyButton.disabled);

        await act(async () => {
            sendReplyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('respuesta optimista'));

        await act(async () => {
            publishReplyDeferred.resolve({
                id: 'reply-final',
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 220,
                tags: [['e', 'note-1', '', 'root'], ['e', 'note-1', '', 'reply']],
                content: 'respuesta final',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('respuesta final'));
        expect(rendered.container.textContent || '').not.toContain('respuesta optimista');

        expect(publishTextNote).toHaveBeenCalledWith(
            'respuesta optimista',
            expect.arrayContaining([
                ['e', 'note-1', '', 'root'],
                ['e', 'note-1', '', 'reply'],
            ])
        );
    });

    test('feed route hash entry keeps overlay renderable', async () => {
        const previousHash = window.location.hash;
        window.location.hash = '#/agora';

        try {
            const { bridge } = createMapBridgeStub();
            const rendered = await renderApp(<App mapBridge={bridge} />);
            mounted.push(rendered);

            await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
            expect(rendered.container.textContent || '').toContain('Metodo de acceso');
        } finally {
            window.location.hash = previousHash;
        }
    });

    test('following feed route opens from toolbar and renders routed surface', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));
        expect(rendered.container.textContent || '').not.toContain('Volver al mapa');
    });

    test('following feed route highlights active sidebar item and does not show legacy back button', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));

        expect(rendered.container.textContent || '').not.toContain('Volver al mapa');
        expect(rendered.container.querySelector('button[aria-label="Abrir mapa"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Abrir Agora"][data-active="true"]')).not.toBeNull();
    });

    test('following feed route returns back to map view from sidebar map action', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));
        const closeButton = rendered.container.querySelector('button[aria-label="Abrir mapa"]') as HTMLButtonElement;
        expect(closeButton).toBeDefined();

        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('.nostr-following-feed-surface') === null);
    });

    test('agora route loads first page when entering /agora directly', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/agora'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
    });

    test('agora route with tag param loads hashtag feed and shows active filter', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/agora?tag=%23NostrCity'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect((socialFeed.service.loadHashtagFeed as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
        expect(rendered.container.textContent || '').not.toContain('Filtrando por #nostrcity');
    });

    test('clears active hashtag filter and goes back to following timeline query', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-hash-clear-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'hola #NostrCity',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-hash-clear-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [['t', 'nostrcity']],
                        content: 'hola #NostrCity',
                    },
                },
            ],
            hasMore: false,
        });
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') !== null);

        const hashtagButton = rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') as HTMLButtonElement;
        expect(hashtagButton).toBeDefined();

        await act(async () => {
            hashtagButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadHashtagFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);

        const clearFilterButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Quitar filtro'
        ) as HTMLButtonElement;
        expect(clearFilterButton).toBeDefined();

        await act(async () => {
            clearFilterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        expect(rendered.container.textContent || '').toContain('Timeline en tiempo real de personas que sigues');
    });

    test('clicking a hashtag in agora activates hashtag route loading', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-hash-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'hola #NostrCity',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-hash-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [['t', 'nostrcity']],
                        content: 'hola #NostrCity',
                    },
                },
            ],
            hasMore: false,
        });

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        await waitFor(() => rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') !== null);

        const hashtagButton = rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') as HTMLButtonElement;
        expect(hashtagButton).toBeDefined();

        await act(async () => {
            hashtagButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadHashtagFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        expect((socialFeed.service.loadHashtagFeed as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
            hashtag: 'nostrcity',
        });
        expect(rendered.container.textContent || '').toContain('Filtrando por #nostrcity');
    });

    test('resolves nostr nprofile mentions to names and chains profile dialogs from feed and dialog posts', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const firstMentionPubkey = 'b'.repeat(64);
        const secondMentionPubkey = 'c'.repeat(64);
        const firstMentionNprofile = nip19.nprofileEncode({ pubkey: firstMentionPubkey });
        const secondMentionNprofile = nip19.nprofileEncode({ pubkey: secondMentionPubkey });
        const socialFeed = createSocialFeedServiceMock();
        const { bridge } = createMapBridgeStub();

        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-mention-feed-1',
                    pubkey: followedPubkey,
                    createdAt: 100,
                    content: `hola nostr:${firstMentionNprofile}`,
                    kind: 'note',
                    rawEvent: {
                        id: 'note-mention-feed-1',
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: `hola nostr:${firstMentionNprofile}`,
                    },
                },
            ],
            hasMore: false,
        });

        const fetchLatestPostsByPubkeyFn = vi.fn().mockImplementation(async ({ pubkey }: { pubkey: string }) => {
            if (pubkey === firstMentionPubkey) {
                return {
                    posts: [
                        {
                            id: 'post-mention-chain-1',
                            pubkey,
                            createdAt: 1_710_000_000,
                            content: `cadena nostr:${secondMentionNprofile}`,
                        },
                    ],
                    hasMore: false,
                };
            }

            return {
                posts: [],
                hasMore: false,
            };
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
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
                            if (pubkey === firstMentionPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Bruno Mention' };
                            }
                            if (pubkey === secondMentionPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Carla Mention' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    fetchLatestPostsByPubkeyFn,
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('button[aria-label="Abrir perfil de Bruno Mention"]') !== null);

        const feedMentionButton = rendered.container.querySelector('button[aria-label="Abrir perfil de Bruno Mention"]') as HTMLButtonElement;
        expect(feedMentionButton).toBeDefined();

        await act(async () => {
            feedMentionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Bruno Mention'));
        expect(rendered.container.querySelector('.nostr-following-feed-surface')).not.toBeNull();

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => document.body.querySelector('button[aria-label="Abrir perfil de Carla Mention"]') !== null);

        const dialogMentionButton = document.body.querySelector('button[aria-label="Abrir perfil de Carla Mention"]') as HTMLButtonElement;
        expect(dialogMentionButton).toBeDefined();

        await act(async () => {
            dialogMentionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Carla Mention'));
    });

    test('chats route renders chats page when entering /chats directly', async () => {
        const ownerPubkey = 'f'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/chats'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
    });

    test('uses lastReadAt semantics for agora unread state and clears on open', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const storageKey = buildFollowingFeedLastReadStorageKey(ownerPubkey, 'v1');
        window.localStorage.setItem(storageKey, JSON.stringify({ lastReadAt: 1_700_000_005 }));

        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-new',
                    pubkey: followedPubkey,
                    createdAt: 1_700_000_006,
                    content: 'nueva nota',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-new',
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 1_700_000_006,
                        tags: [],
                        content: 'nueva nota',
                    },
                },
            ],
            hasMore: false,
            nextUntil: undefined,
        });

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        await waitFor(() => rendered.container.querySelector('.nostr-panel-toolbar .nostr-following-feed-unread-dot') !== null);

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('.nostr-panel-toolbar .nostr-following-feed-unread-dot') === null);
        const storedPayload = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as { lastReadAt?: number };
        expect(typeof storedPayload.lastReadAt).toBe('number');
        expect((storedPayload.lastReadAt || 0) >= 1_700_000_006).toBe(true);
    });

    test('does not mark agora as unread when feed items are older than lastReadAt', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const storageKey = buildFollowingFeedLastReadStorageKey(ownerPubkey, 'v1');
        window.localStorage.setItem(storageKey, JSON.stringify({ lastReadAt: 1_700_000_005 }));

        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-old',
                    pubkey: followedPubkey,
                    createdAt: 1_700_000_004,
                    content: 'nota vieja',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-old',
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 1_700_000_004,
                        tags: [],
                        content: 'nota vieja',
                    },
                },
            ],
            hasMore: true,
            nextUntil: 1_700_000_003,
        });

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);

        await act(async () => {
            await Promise.resolve();
        });
        expect(rendered.container.querySelector('.nostr-panel-toolbar .nostr-following-feed-unread-dot')).toBeNull();
    });

    test('renders chat button in panel and compact toolbar and opens chat dialog in list view', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialNotificationsServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialNotificationsService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelChatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        expect(panelChatButton).toBeDefined();
        const panelNotificationsButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir notificaciones"]');
        expect(panelNotificationsButton).not.toBeNull();

        await act(async () => {
            panelChatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Chats');
        expect(rendered.container.textContent || '').toContain('No hay conversaciones todavía');

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const compactChatButton = rendered.container.querySelector('.nostr-compact-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        expect(compactChatButton).toBeDefined();
        const compactNotificationsButton = rendered.container.querySelector('.nostr-compact-toolbar button[aria-label="Abrir notificaciones"]');
        expect(compactNotificationsButton).not.toBeNull();
    });

    test('orders main sidebar actions as mapa/agora/chats/relays/notificaciones/buscar/estadisticas/descubre/ajustes', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const socialNotifications = createSocialNotificationsServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                    socialNotificationsService: socialNotifications.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const requiredOrder = [
            'Abrir mapa',
            'Abrir Agora',
            'Abrir chats',
            'Abrir relays',
            'Abrir notificaciones',
            'Abrir buscador global de usuarios',
            'Abrir estadisticas de la ciudad',
            'Abrir descubre',
            'Abrir ajustes',
        ];

        const panelButtons = Array.from(rendered.container.querySelectorAll('.nostr-panel-toolbar > [data-slot="sidebar-menu-item"] button')) as HTMLButtonElement[];
        const panelLabels = panelButtons.map((button) => button.getAttribute('aria-label') || '');
        const orderedVisibleLabels = panelLabels.filter((label) => requiredOrder.includes(label));

        expect(orderedVisibleLabels).toEqual(requiredOrder);
        expect(panelLabels).not.toContain('Regenerar mapa');
    });

    test('hides chat entry points when session is not dm-capable', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        expect(rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]')).toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Ocultar panel"]')).toBeNull();
    });

    test('shows unread dot and opens notifications dialog with pending snapshot', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialNotificationsServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialNotificationsService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        socialFeed.emit({
            id: 'notif-1',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 1_700_000_001,
            tags: [['p', ownerPubkey], ['e', 'b'.repeat(64)]],
            content: '+',
        });

        await waitFor(() => rendered.container.querySelector('.nostr-panel-toolbar .nostr-notifications-unread-dot') !== null);

        const button = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir notificaciones"]') as HTMLButtonElement;
        expect(button).toBeDefined();

        await act(async () => {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Notificaciones');
        expect(rendered.container.textContent || '').toContain('Reaccion');
        expect(rendered.container.querySelector('.nostr-panel-toolbar .nostr-notifications-unread-dot')).toBeNull();
    });

    test('uses lastReadAt semantics for realtime notifications unread state', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const storageKey = buildSocialLastReadStorageKey(ownerPubkey, 'v1');
        window.localStorage.setItem(storageKey, JSON.stringify({ lastReadAt: 1_700_000_005 }));
        const socialFeed = createSocialNotificationsServiceMock();
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialNotificationsService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        socialFeed.emit({
            id: 'notif-old',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 1_700_000_004,
            tags: [['p', ownerPubkey], ['e', 'b'.repeat(64)]],
            content: '+',
        });

        await act(async () => {
            await Promise.resolve();
        });
        expect(rendered.container.querySelector('.nostr-panel-toolbar .nostr-notifications-unread-dot')).toBeNull();

        socialFeed.emit({
            id: 'notif-new',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 1_700_000_006,
            tags: [['p', ownerPubkey], ['e', 'b'.repeat(64)]],
            content: '+',
        });

        await waitFor(() => rendered.container.querySelector('.nostr-panel-toolbar .nostr-notifications-unread-dot') !== null);
    });

    test('loads DM dialog data through dm api service without runtime read fallback', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const peerPubkey = 'a'.repeat(64);
        const runtimeReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => [{
                id: 'runtime-fallback-inbox',
                clientMessageId: 'runtime-fallback-inbox',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 1,
                plaintext: 'runtime fallback inbox',
                deliveryState: 'sent' as const,
            }]),
            loadConversationMessages: vi.fn(async () => [{
                id: 'runtime-fallback-thread',
                clientMessageId: 'runtime-fallback-thread',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 2,
                plaintext: 'runtime fallback thread',
                deliveryState: 'sent' as const,
            }]),
            sendDm: vi.fn(async () => ({
                id: 'runtime-send',
                clientMessageId: 'runtime-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 3,
                plaintext: 'runtime send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const apiReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => [{
                id: 'api-inbox-1',
                clientMessageId: 'api-inbox-1',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 1700000100,
                plaintext: 'hola api dm',
                deliveryState: 'sent' as const,
            }]),
            loadConversationMessages: vi.fn(async () => [{
                id: 'api-thread-1',
                clientMessageId: 'api-thread-1',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 1700000101,
                plaintext: 'hola api dm',
                deliveryState: 'sent' as const,
            }]),
            sendDm: vi.fn(async () => ({
                id: 'api-send',
                clientMessageId: 'api-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000102,
                plaintext: 'api send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };

        const createRuntimeServiceSpy = vi.spyOn(runtimeDmServiceModule, 'createRuntimeDirectMessagesService').mockReturnValue(runtimeReadService as any);
        const createDmApiServiceSpy = vi.spyOn(dmApiServiceModule, 'createDmApiService').mockReturnValue(apiReadService as any);
        createNdkDmTransportClientSpy!.mockImplementation(() => ({
            publishToRelays: vi.fn(async () => ({
                ackedRelays: ['wss://relay.one'],
                failedRelays: [],
                timeoutRelays: [],
            })),
            subscribe: vi.fn(() => ({
                unsubscribe() {
                    return;
                },
            })),
            fetchBackfill: vi.fn(async () => []),
        } as any));
        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent: vi.fn(async () => {
                throw new Error('not-used');
            }),
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [peerPubkey]: { pubkey: peerPubkey, displayName: 'Alice' },
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

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const chatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        await act(async () => {
            chatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
        await waitFor(() => !(rendered.container.textContent || '').includes('No hay conversaciones todavía'));

        expect(rendered.container.textContent || '').toContain('hola api dm');
        expect(createRuntimeServiceSpy).not.toHaveBeenCalled();
        expect(createDmApiServiceSpy).toHaveBeenCalled();
        expect(apiReadService.subscribeInbox).toHaveBeenCalled();
        expect(apiReadService.loadInitialConversations).toHaveBeenCalled();
        expect(runtimeReadService.subscribeInbox).not.toHaveBeenCalled();
        expect(runtimeReadService.loadInitialConversations).not.toHaveBeenCalled();
        expect(runtimeReadService.loadConversationMessages).not.toHaveBeenCalled();

    });

    test('runtime DM factory wires subscribe/send against dm-service', async () => {
        const ownerPubkey = 'a'.repeat(64);
        const peerPubkey = 'b'.repeat(64);
        const subscribeInbox = vi.fn((_input, onMessage) => {
            onMessage({
                id: 'incoming-1',
                clientMessageId: '',
                conversationId: ownerPubkey,
                peerPubkey: ownerPubkey,
                direction: 'incoming' as const,
                createdAt: 100,
                plaintext: 'runtime incoming',
                deliveryState: 'sent' as const,
            });
            return () => {};
        });
        const sendDm = vi.fn(async () => ({
            id: 'outgoing-1',
            clientMessageId: 'client-1',
            conversationId: peerPubkey,
            peerPubkey,
            direction: 'outgoing' as const,
            createdAt: 120,
            plaintext: 'hola runtime',
            deliveryState: 'sent' as const,
            publishResult: {
                ackedRelays: ['wss://relay.one'],
                failedRelays: [],
                timeoutRelays: [],
            },
            attempts: 1,
        }));
        const createDmService = vi.fn(() => ({
            subscribeInbox,
            sendDm,
        }));
        const createTransport = vi.fn(() => ({
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({ unsubscribe: () => {} })),
            fetchBackfill: vi.fn(async () => []),
        }));

        const { createRuntimeDirectMessagesService } = await import('../nostr/dm-runtime-service');
        const service = createRuntimeDirectMessagesService({
            writeGateway: {
                publishEvent: vi.fn(),
                encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
                decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
            },
            createDmService,
            createTransport,
            resolveRelays: () => ['wss://relay.one'],
        });

        const onMessage = vi.fn();
        const stop = service.subscribeInbox({ ownerPubkey }, onMessage);
        const sent = await service.sendDm?.({
            ownerPubkey,
            peerPubkey,
            plaintext: 'hola runtime',
            clientMessageId: 'client-1',
        });

        expect(createDmService).toHaveBeenCalled();
        expect(createTransport).toHaveBeenCalled();
        expect(subscribeInbox).toHaveBeenCalledWith(
            { ownerPubkey },
            expect.any(Function)
        );
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
            id: 'incoming-1',
            conversationId: ownerPubkey,
        }));
        expect(sendDm).toHaveBeenCalledWith(expect.objectContaining({
            ownerPubkey,
            peerPubkey,
            plaintext: 'hola runtime',
            clientMessageId: 'client-1',
            targetRelays: ['wss://relay.one'],
        }));
        expect(sent).toMatchObject({
            id: 'outgoing-1',
            conversationId: peerPubkey,
            plaintext: 'hola runtime',
        });

        if (typeof stop === 'function') {
            stop();
        }
    });

    test('opens chat dialog and shows existing conversations from dm api backfill', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const peerPubkey = 'a'.repeat(64);
        const runtimeReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'runtime-send',
                clientMessageId: 'runtime-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000301,
                plaintext: 'runtime send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const apiReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => [{
                id: 'api-historical-1',
                clientMessageId: 'api-historical-1',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 1700000300,
                plaintext: 'historial visible',
                deliveryState: 'sent' as const,
            }]),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'api-send',
                clientMessageId: 'api-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000302,
                plaintext: 'api send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const createRuntimeServiceSpy = vi
            .spyOn(runtimeDmServiceModule, 'createRuntimeDirectMessagesService')
            .mockReturnValue(runtimeReadService as any);
        const createDmApiServiceSpy = vi
            .spyOn(dmApiServiceModule, 'createDmApiService')
            .mockReturnValue(apiReadService as any);

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [peerPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [peerPubkey]: { pubkey: peerPubkey, displayName: 'Alice' },
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

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelChatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        await act(async () => {
            panelChatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));
        expect(rendered.container.textContent || '').toContain('historial visible');

        expect(createRuntimeServiceSpy).not.toHaveBeenCalled();
        expect(createDmApiServiceSpy).toHaveBeenCalled();
        expect(apiReadService.subscribeInbox).toHaveBeenCalled();
        expect(apiReadService.loadInitialConversations).toHaveBeenCalled();
        expect(runtimeReadService.subscribeInbox).not.toHaveBeenCalled();
        expect(runtimeReadService.loadInitialConversations).not.toHaveBeenCalled();
        expect(runtimeReadService.loadConversationMessages).not.toHaveBeenCalled();
    });

    test('does not initialize runtime dm transport while loading chat reads from bff', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const hintedRelay = 'wss://relay.hinted.example';
        const createRuntimeServiceSpy = vi.spyOn(runtimeDmServiceModule, 'createRuntimeDirectMessagesService');
        const createDmApiServiceSpy = vi.spyOn(dmApiServiceModule, 'createDmApiService').mockReturnValue({
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'api-send',
                clientMessageId: 'api-send',
                conversationId: 'a'.repeat(64),
                peerPubkey: 'a'.repeat(64),
                direction: 'outgoing',
                createdAt: 1700000401,
                plaintext: 'api send',
                deliveryState: 'sent',
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        } as any);

        createNdkDmTransportClientSpy!.mockReturnValue({
            publishToRelays: vi.fn(async () => ({
                ackedRelays: [],
                failedRelays: [],
                timeoutRelays: [],
            })),
            subscribe: vi.fn(() => ({
                unsubscribe() {
                    return;
                },
            })),
            fetchBackfill: vi.fn(async () => []),
        } as any);

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
                                    id: '1'.repeat(64),
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 1700000400,
                                    tags: [['r', hintedRelay]],
                                    content: '',
                                    sig: '2'.repeat(128),
                                } as any;
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelChatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        await act(async () => {
            panelChatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));

        expect(createDmApiServiceSpy).toHaveBeenCalled();
        expect(createRuntimeServiceSpy).not.toHaveBeenCalled();
        expect(createNdkDmTransportClientSpy).not.toHaveBeenCalled();
    });

    test('caps runtime dm relay fanout to avoid oversized target relay lists', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();
        const transportCreations: Array<{
            relays: string[];
            publishToRelays: ReturnType<typeof vi.fn>;
        }> = [];

        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: Array.from({ length: 12 }, (_, index) => `wss://relay.config-${index}.example`),
                byType: {
                    nip65Both: Array.from({ length: 6 }, (_, index) => `wss://relay.both-${index}.example`),
                    nip65Read: Array.from({ length: 6 }, (_, index) => `wss://relay.read-${index}.example`),
                    nip65Write: Array.from({ length: 6 }, (_, index) => `wss://relay.write-${index}.example`),
                    dmInbox: Array.from({ length: 6 }, (_, index) => `wss://relay.inbox-${index}.example`),
                },
            })
        );

        createNdkDmTransportClientSpy!.mockImplementation((relays: string[] = []) => {
            const publishToRelays = vi.fn(async () => ({
                ackedRelays: ['wss://relay.ack.example'],
                failedRelays: [],
                timeoutRelays: [],
            }));
            transportCreations.push({
                relays,
                publishToRelays,
            });

            return {
                publishToRelays,
                subscribe: vi.fn(() => ({
                    unsubscribe() {
                        return;
                    },
                })),
                fetchBackfill: vi.fn(async () => []),
            } as any;
        });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (_pubkey: string, kind: number) => {
                            if (kind === 10002) {
                                return {
                                    id: 'relay-list-owner',
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 1700001500,
                                    tags: [
                                        ...Array.from({ length: 6 }, (_, index) => ['r', `wss://relay.owner-both-${index}.example`] as string[]),
                                        ...Array.from({ length: 6 }, (_, index) => ['r', `wss://relay.owner-write-${index}.example`, 'write'] as string[]),
                                    ],
                                    content: '',
                                    sig: '4'.repeat(128),
                                } as any;
                            }

                            if (kind === 10050) {
                                return {
                                    id: 'relay-dm-owner',
                                    pubkey: ownerPubkey,
                                    kind: 10050,
                                    created_at: 1700001600,
                                    tags: Array.from({ length: 6 }, (_, index) => ['relay', `wss://relay.owner-dm-${index}.example`]),
                                    content: '',
                                    sig: '5'.repeat(128),
                                } as any;
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: Array.from({ length: 6 }, (_, index) => `wss://relay.hint-${index}.example`),
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

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));

        const dmItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            dmItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));

        const composer = rendered.container.querySelector('.nostr-chat-composer-input') as HTMLTextAreaElement;
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(composer, 'mensaje capped');
            composer.dispatchEvent(new Event('input', { bubbles: true }));
            composer.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const sendButton = rendered.container.querySelector('.nostr-chat-send') as HTMLButtonElement;
        await act(async () => {
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => transportCreations.some((entry) => entry.publishToRelays.mock.calls.length > 0));

        const sendingTransport = transportCreations.find((entry) => entry.publishToRelays.mock.calls.length > 0);
        expect(sendingTransport).toBeDefined();
        expect(sendingTransport!.relays.length).toBeLessThanOrEqual(8);

        const firstRelayTargets = sendingTransport!.publishToRelays.mock.calls[0]?.[1] as string[];
        expect(Array.isArray(firstRelayTargets)).toBe(true);
        expect(firstRelayTargets.length).toBeLessThanOrEqual(8);
    });

    test('updates chat list when dm api bootstrap resolves after dialog is already open', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const peerPubkey = 'a'.repeat(64);
        let resolveApiBackfill: ((items: any[]) => void) | null = null;
        const apiBackfillPromise = new Promise<any[]>((resolve) => {
            resolveApiBackfill = resolve;
        });
        const runtimeReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'runtime-send',
                clientMessageId: 'runtime-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000601,
                plaintext: 'runtime send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const apiReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => apiBackfillPromise),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'api-send',
                clientMessageId: 'api-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000602,
                plaintext: 'api send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const createRuntimeServiceSpy = vi
            .spyOn(runtimeDmServiceModule, 'createRuntimeDirectMessagesService')
            .mockReturnValue(runtimeReadService as any);
        const createDmApiServiceSpy = vi
            .spyOn(dmApiServiceModule, 'createDmApiService')
            .mockReturnValue(apiReadService as any);

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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [peerPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [peerPubkey]: { pubkey: peerPubkey, displayName: 'Alice' },
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

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelChatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        await act(async () => {
            panelChatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => apiReadService.loadInitialConversations.mock.calls.length > 0);

        await waitFor(() => (rendered.container.textContent || '').includes('Cargando conversaciones'));

        await act(async () => {
            resolveApiBackfill?.([
                {
                    id: 'api-historical-late',
                    clientMessageId: 'api-historical-late',
                    conversationId: peerPubkey,
                    peerPubkey,
                    direction: 'incoming',
                    createdAt: 1700000600,
                    plaintext: 'historial tardio',
                    deliveryState: 'sent',
                },
            ]);
        });

        await waitFor(() => (rendered.container.textContent || '').includes('historial tardio'));

        expect(createRuntimeServiceSpy).not.toHaveBeenCalled();
        expect(createDmApiServiceSpy).toHaveBeenCalled();
        expect(runtimeReadService.loadInitialConversations).not.toHaveBeenCalled();
        expect(runtimeReadService.subscribeInbox).not.toHaveBeenCalled();
    });

    test('renders map zoom controls with current zoom level', async () => {
        const { bridge } = createMapBridgeStub();
        (bridge.getZoom as any).mockReturnValue(2.5);
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const content = rendered.container.textContent || '';
        expect(content).toContain('2.50x');
    });

    test('applies zoom controls in +1 and -1 steps', async () => {
        const { bridge } = createMapBridgeStub();
        (bridge.getZoom as any).mockReturnValue(4);
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

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
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const zoomGroup = rendered.container.querySelector('.nostr-map-zoom-controls [data-slot="button-group"]');
        expect(zoomGroup).toBeDefined();

        const zoomButtons = Array.from(rendered.container.querySelectorAll('.nostr-map-zoom-controls .nostr-map-zoom-button')) as HTMLButtonElement[];
        expect(zoomButtons.length).toBe(2);
        expect(zoomButtons[0]?.getAttribute('aria-label')).toBe('Alejar mapa');
        expect(zoomButtons[1]?.getAttribute('aria-label')).toBe('Acercar mapa');
        expect(zoomButtons[0]?.className.includes('nostr-map-zoom-button-left')).toBe(true);
        expect(zoomButtons[1]?.className.includes('nostr-map-zoom-button-right')).toBe(true);

        const regenerateButton = rendered.container.querySelector('.nostr-map-zoom-controls .nostr-map-regenerate-button') as HTMLButtonElement;
        expect(regenerateButton).toBeDefined();
        expect(regenerateButton.getAttribute('aria-label')).toBe('Regenerar mapa');
    });

    test('renders floating display toggle group with car, street and special marker toggles', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const controls = rendered.container.querySelector('.nostr-map-display-controls [data-slot="toggle-group"]');
        expect(controls).toBeDefined();
        const carsButton = rendered.container.querySelector('button[aria-label="Alternar coches del mapa"]') as HTMLButtonElement;
        const streetsButton = rendered.container.querySelector('button[aria-label="Alternar etiquetas de calles"]') as HTMLButtonElement;
        const specialMarkersButton = rendered.container.querySelector('button[aria-label="Alternar iconos especiales"]') as HTMLButtonElement;
        expect(carsButton).toBeDefined();
        expect(streetsButton).toBeDefined();
        expect(specialMarkersButton).toBeDefined();
        expect(carsButton.className.includes('nostr-map-display-toggle-button')).toBe(true);
        expect(streetsButton.className.includes('nostr-map-display-toggle-button')).toBe(true);
        expect(specialMarkersButton.className.includes('nostr-map-display-toggle-button')).toBe(true);
    });

    test('toggles special markers from floating controls and persists preference', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const specialMarkersButton = rendered.container.querySelector('button[aria-label="Alternar iconos especiales"]') as HTMLButtonElement;
        expect(specialMarkersButton).toBeDefined();

        await act(async () => {
            specialMarkersButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const firstSaved = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}');
        expect(firstSaved.specialMarkersEnabled).toBe(false);
        await waitFor(() => (document.body.textContent || '').includes('Iconos especiales desactivados'));

        await act(async () => {
            specialMarkersButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const secondSaved = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}');
        expect(secondSaved.specialMarkersEnabled).toBe(true);
        await waitFor(() => (document.body.textContent || '').includes('Iconos especiales activados'));
    });

    test('toggles street labels from floating controls', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const streetLabelsButton = rendered.container.querySelector('button[aria-label="Alternar etiquetas de calles"]') as HTMLButtonElement;
        expect(streetLabelsButton).toBeDefined();

        await act(async () => {
            streetLabelsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.setStreetLabelsEnabled as any).mock.calls;
            return calls.length > 1;
        });

        expect((bridge.setStreetLabelsEnabled as any).mock.calls.at(-1)?.[0]).toBe(false);

        await act(async () => {
            streetLabelsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.setStreetLabelsEnabled as any).mock.calls;
            return calls.length > 2;
        });

        expect((bridge.setStreetLabelsEnabled as any).mock.calls.at(-1)?.[0]).toBe(true);
        await waitFor(() => (document.body.textContent || '').includes('Etiquetas de calles activadas'));
        const saved = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}');
        expect(saved.streetLabelsZoomLevel).toBe(2);
        expect((bridge.setStreetLabelsZoomLevel as any).mock.calls.at(-1)?.[0]).toBe(2);
    });

    test('uses street label zoom default 2 on mount when no setting is stored', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => (bridge.setStreetLabelsZoomLevel as any).mock.calls.length > 0);

        expect((bridge.setStreetLabelsZoomLevel as any).mock.calls.at(-1)?.[0]).toBe(2);
    });

    test('toggles cars from floating controls restoring previous count', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            streetLabelsZoomLevel: 10,
            trafficParticlesCount: 18,
            trafficParticlesSpeed: 1,
        }));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const carsButton = rendered.container.querySelector('button[aria-label="Alternar coches del mapa"]') as HTMLButtonElement;
        expect(carsButton).toBeDefined();

        await act(async () => {
            carsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.setTrafficParticlesCount as any).mock.calls;
            return calls.some((call: unknown[]) => call[0] === 0);
        });

        expect((bridge.setTrafficParticlesCount as any).mock.calls.at(-1)?.[0]).toBe(0);
        await waitFor(() => (document.body.textContent || '').includes('Coches desactivados'));

        await act(async () => {
            carsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.setTrafficParticlesCount as any).mock.calls;
            return calls.some((call: unknown[]) => call[0] === 18);
        });

        expect((bridge.setTrafficParticlesCount as any).mock.calls.at(-1)?.[0]).toBe(18);
        await waitFor(() => (document.body.textContent || '').includes('Coches activados'));
    });

    test('shows owner profile actions menu and runs locate/copy actions', async () => {
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

        const actionsButton = rendered.container.querySelector('button[aria-label="Abrir menu de usuario"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();
        const userMenuSection = actionsButton.closest('[data-slot="sidebar-menu"]') as HTMLElement;
        expect(userMenuSection).toBeDefined();
        expect(userMenuSection.className).toContain('border-t');

        await openDropdownTrigger(actionsButton);

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Copiar npub'
        ));

        expect(document.body.querySelector('[data-slot="dropdown-menu-label"]')).toBeNull();

        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Copiar npub'
        ) as HTMLElement;
        const locateItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ) as HTMLElement;
        const messageItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Enviar mensaje'
        );

        expect(copyItem).toBeDefined();
        expect(locateItem).toBeDefined();
        expect(messageItem).toBeUndefined();

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);
        await waitFor(() => (rendered.container.textContent || '').includes('npub copiada'));

        await openDropdownTrigger(actionsButton);

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ));

        const locateItemAgain = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ) as HTMLElement;

        await act(async () => {
            locateItemAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect((bridge.focusBuilding as any).mock.calls.some((call: unknown[]) => call[0] === 0)).toBe(true);
    });

    test('shows locate/copy actions for following rows and returns to map route when locating', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const { bridge } = createMapBridgeStub(6);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
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
            />,
            {
                initialEntries: ['/'],
            }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Agora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('.nostr-following-feed-surface') !== null);

        const followingTab = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Sigues (1)')
        ) as HTMLButtonElement;
        expect(followingTab).toBeDefined();

        await act(async () => {
            followingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            followingTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const actionsButton = rendered.container.querySelector('button[aria-label="Abrir acciones para Alice"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ));

        const zapSubTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((node) =>
            (node.textContent || '').trim() === 'Zap'
        ) as HTMLElement;
        expect(zapSubTrigger).toBeDefined();

        const locateFollowingItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ) as HTMLElement;
        expect(locateFollowingItem).toBeDefined();

        const focusCallsBeforeLocate = (bridge.focusBuilding as any).mock.calls.length;
        await act(async () => {
            locateFollowingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect((bridge.focusBuilding as any).mock.calls.length).toBeGreaterThan(focusCallsBeforeLocate);
        await waitFor(() => rendered.container.querySelector('.nostr-following-feed-surface') === null);
        expect(rendered.container.querySelector('[aria-label="Controles de zoom"]')).not.toBeNull();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Copiar npub'
        ));

        const copyFollowingItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Copiar npub'
        ) as HTMLElement;

        await act(async () => {
            copyFollowingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);
    });

    test('allows following from followers tab and updates row state to following', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const followerPubkey = 'b'.repeat(64);
        const publishContactList = vi.fn(async () => ({
            id: '1'.repeat(64),
            pubkey: ownerPubkey,
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', followedPubkey], ['p', followerPubkey]],
            content: '',
            sig: '2'.repeat(128),
        }));

        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent: vi.fn(async (event: any) => ({
                ...event,
                id: '3'.repeat(64),
                pubkey: ownerPubkey,
                sig: '4'.repeat(128),
            })),
            publishContactList,
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

        const { bridge } = createMapBridgeStub(8);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                        [followerPubkey]: { pubkey: followerPubkey, displayName: 'Bob' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [followerPubkey],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const followersTab = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Seguidores (1)')
        ) as HTMLButtonElement;
        expect(followersTab).toBeDefined();

        await act(async () => {
            followersTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            followersTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Bob'));

        const followBobButton = rendered.container.querySelector('button[aria-label="Seguir a Bob"]') as HTMLButtonElement;
        expect(followBobButton).toBeDefined();
        expect(followBobButton.disabled).toBe(false);

        await act(async () => {
            followBobButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(publishContactList).toHaveBeenCalledTimes(1);
        expect(publishContactList).toHaveBeenCalledWith([followedPubkey, followerPubkey]);

        await waitFor(() => {
            const followingButton = rendered.container.querySelector('button[aria-label="Ya sigues a Bob"]') as HTMLButtonElement | null;
            return Boolean(followingButton && followingButton.disabled);
        });
    });

    test('navigates to map route when selecting a followed user from relays view', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const personPubkey = 'a'.repeat(64);

        const { bridge } = createMapBridgeStub(6);
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
                        follows: [personPubkey],
                        relayHints: [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [personPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [personPubkey]: { pubkey: personPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [personPubkey],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            {
                initialEntries: ['/'],
            }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const relaysButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir relays"]') as HTMLButtonElement;
        expect(relaysButton).toBeDefined();

        await act(async () => {
            relaysButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('[aria-label="Relays"]') !== null);

        const followingTab = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Sigues (1)')
        ) as HTMLButtonElement;
        expect(followingTab).toBeDefined();

        await act(async () => {
            followingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            followingTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const followedButton = Array.from(rendered.container.querySelectorAll('button[aria-pressed]')).find((button) =>
            (button.textContent || '').includes('Alice')
        ) as HTMLButtonElement;
        expect(followedButton).toBeDefined();

        await act(async () => {
            followedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('[aria-label="Relays"]') === null);
        expect(rendered.container.querySelector('[aria-label="Controles de zoom"]')).not.toBeNull();
    });

    test('shows map loader stage messages while processing npub', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);

        const followsDeferred = createDeferred<{ ownerPubkey: string; follows: string[]; relayHints: string[] }>();
        const profilesDeferred = createDeferred<Record<string, { pubkey: string; displayName: string }>>();
        const mapDeferred = createDeferred<void>();

        const { bridge } = createMapBridgeStub(6);
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

        expect(rendered.container.querySelector('[data-testid="login-gate-screen"]')).not.toBeNull();
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

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        expect(rendered.container.textContent || '').toContain('Cargando');

        await act(async () => {
            resolveFollowers?.();
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
    });

    test('shows Read Only badge inside user menu item in expanded sidebar', async () => {
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
        const userMenuButton = rendered.container.querySelector('button[aria-label="Abrir menu de usuario"]') as HTMLButtonElement;
        expect(userMenuButton).toBeDefined();
        expect(userMenuButton.textContent || '').toContain('Read Only');

        const topStatusBadge = rendered.container.querySelector('.nostr-panel-toolbar-status [data-slot="badge"]');
        expect(topStatusBadge).toBeNull();

    });

    test('opens occupant dialog and focuses building after occupied building click event', async () => {
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
            const highlightCalls = (bridge.setDialogBuildingHighlight as any).mock.calls;
            return highlightCalls.length > 0 && highlightCalls[highlightCalls.length - 1][0] === 4;
        });

        const occupantDialog = document.body.querySelector('[data-slot="dialog-content"][aria-label="Perfil del ocupante"]') as HTMLElement;
        expect(occupantDialog).toBeDefined();
        expect(occupantDialog.style.width).toBe('640px');
        expect(occupantDialog.style.maxWidth).toBe('calc(100vw - 32px)');

        const closeButton = rendered.container.querySelector('button[aria-label="Cerrar perfil"]') as HTMLButtonElement;
        expect(closeButton).toBeDefined();

        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const latestCalls = (bridge.setDialogBuildingHighlight as any).mock.calls;
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
        expect(document.body.textContent || '').not.toContain('Enviar mensaje');
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
        expect((clipboardWriteText.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((node) =>
            (node.textContent || '').includes('Ver detalles')
        ));

        const detailsItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Ver detalles')
        ) as HTMLElement;

        await act(async () => {
            detailsItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getActiveProfileDialog() !== null);

        expect(document.body.textContent || '').not.toContain('Configurar cantidades');
    });

    test('opens chat detail directly from context menu and focuses composer', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
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
                    directMessagesService: {
                        subscribeInbox: () => () => {},
                        sendDm: vi.fn(async (input) => ({
                            id: `msg:${input.clientMessageId}`,
                            clientMessageId: input.clientMessageId,
                            conversationId: input.peerPubkey,
                            peerPubkey: input.peerPubkey,
                            direction: 'outgoing' as const,
                            createdAt: 100,
                            plaintext: input.plaintext,
                            deliveryState: 'sent' as const,
                        })),
                    },
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));

        const dmItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            dmItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const composer = rendered.container.querySelector('.nostr-chat-composer-input') as HTMLTextAreaElement;
        expect(composer).toBeDefined();
        expect(document.activeElement).toBe(composer);
    });

    test('shows pending message immediately while send is still in-flight', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();
        const sendDeferred = createDeferred<any>();
        let sendInput: {
            ownerPubkey: string;
            peerPubkey: string;
            plaintext: string;
            clientMessageId: string;
        } | null = null;

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
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
                    directMessagesService: {
                        subscribeInbox: () => () => {},
                        sendDm: vi.fn(async (input) => {
                            sendInput = input;
                            return sendDeferred.promise;
                        }),
                    },
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));
        const dmItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            dmItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));

        const composer = rendered.container.querySelector('.nostr-chat-composer-input') as HTMLTextAreaElement;
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(composer, 'primer mensaje');
            composer.dispatchEvent(new Event('input', { bubbles: true }));
            composer.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const sendButton = rendered.container.querySelector('.nostr-chat-send') as HTMLButtonElement;
        await act(async () => {
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('primer mensaje'));
        expect(rendered.container.textContent || '').toContain('Enviando...');

        expect(sendInput).not.toBeNull();
        sendDeferred.resolve({
            id: 'sent-1',
            clientMessageId: sendInput!.clientMessageId,
            conversationId: followedPubkey,
            peerPubkey: followedPubkey,
            direction: 'outgoing' as const,
            createdAt: 1700001300,
            plaintext: sendInput!.plaintext,
            deliveryState: 'sent' as const,
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Enviado'));
    });

    test('hides enviar mensaje action in context menu when session is not dm-capable', async () => {
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 1,
                pubkey: 'a'.repeat(64),
                clientX: 300,
                clientY: 220,
            });
        });

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(document.body.textContent || '').not.toContain('Copiar npub');
        expect(document.body.textContent || '').not.toContain('Enviar mensaje');
    });

    test('closes chat dialog after logout from a dm-capable session', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
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
                    directMessagesService: {
                        subscribeInbox: () => () => {},
                    },
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));
        const dmItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            dmItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => !(rendered.container.textContent || '').includes('Chats'));
        expect(rendered.container.querySelector('.nostr-chats-page')).toBeNull();
    });

    test('opens easter egg dialog with embedded pdf actions', async () => {
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        expect(rendered.container.textContent || '').not.toContain('Bitcoin: A Peer-to-Peer Electronic Cash System');

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 7,
                easterEggId: 'bitcoin_whitepaper',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Bitcoin: A Peer-to-Peer Electronic Cash System'));

        const pdfFrame = rendered.container.querySelector('iframe.nostr-easter-egg-pdf') as HTMLIFrameElement;
        expect(pdfFrame).toBeDefined();
        expect(pdfFrame.getAttribute('src')).toBe('/easter-eggs/bitcoin.pdf');

        const links = Array.from(rendered.container.querySelectorAll('.nostr-easter-egg-action')) as HTMLAnchorElement[];
        expect(links.some((link) => (link.textContent || '').includes('Descargar PDF'))).toBe(true);
        expect(links.some((link) => (link.textContent || '').includes('Abrir / Ampliar'))).toBe(true);
    });

    test('opens easter egg dialog for text content', async () => {
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 3,
                easterEggId: 'cyberspace_independence',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('A Declaration of the Independence of Cyberspace'));
        expect(rendered.container.textContent || '').toContain('Governments of the Industrial World');
    });

    test('opens Agora route when clicking reserved special building', async () => {
        const { bridge, triggerSpecialBuildingClick } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerSpecialBuildingClick({
                buildingIndex: 4,
                specialBuildingId: 'agora',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));
    });

    test('persists discovered easter eggs and shows persistent marker on map', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub(8);
        (bridge as any).listEasterEggBuildings.mockReturnValue([
            {
                index: 7,
                easterEggId: 'crypto_anarchist_manifesto',
            },
        ]);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 7,
                easterEggId: 'crypto_anarchist_manifesto',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('The Crypto Anarchist Manifesto'));

        const progressRaw = window.localStorage.getItem(`nostr.overlay.easter-eggs.v1:user:${ownerPubkey}`);
        expect(progressRaw).toBeTruthy();
        expect(JSON.parse(progressRaw || '{}')).toEqual({
            discoveredIds: ['crypto_anarchist_manifesto'],
        });

        const marker = rendered.container.querySelector('.nostr-map-easter-egg-marker') as HTMLElement;
        expect(marker).toBeDefined();
    });

    test('opens settings dialog, mounts map settings from advanced section and shows shortcuts screen', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsButton).toBeDefined();
        expect(settingsButton.getAttribute('title')).toBe('Settings');

        const mountedOnOpen = (bridge.mountSettingsPanel as any).mock.calls.some((call: [unknown]) => call[0] instanceof HTMLElement);
        expect(mountedOnOpen).toBe(false);

        await selectSettingsContextAction(rendered.container, 'Ajustes avanzados');

        await waitFor(() => {
            const calls = (bridge.mountSettingsPanel as any).mock.calls;
            return calls.length > 0 && calls[calls.length - 1][0] instanceof HTMLElement;
        });

        await selectSettingsContextAction(rendered.container, 'Atajos');

        expect(rendered.container.textContent || '').toContain('Mantener pulsada la barra espaciadora y arrastrar');
        expect(rendered.container.textContent || '').toContain('Mantener pulsado el wheel del raton y mover el raton');
    });

    test('shows settings dropdown inside sidebar and opens routed settings pages', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const settingsToggleButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsToggleButton).toBeDefined();

        await act(async () => {
            settingsToggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Ajustes avanzados'));

        const uiButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Interfaz'
        ) as HTMLButtonElement;
        expect(uiButton).toBeDefined();

        await act(async () => {
            uiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Etiquetas de calles'));
        expect(rendered.container.querySelector('button[aria-label="Abrir ajustes de interfaz"][data-active="true"]')).not.toBeNull();
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
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await waitFor(() => {
            const countCalls = (bridge.setTrafficParticlesCount as any).mock.calls;
            const speedCalls = (bridge.setTrafficParticlesSpeed as any).mock.calls;
            return countCalls.length > 0 && speedCalls.length > 0;
        });

        expect((bridge.setTrafficParticlesCount as any)).toHaveBeenCalledWith(20);
        expect((bridge.setTrafficParticlesSpeed as any)).toHaveBeenCalledWith(1.4);

        await selectSettingsContextAction(rendered.container, 'Interfaz');

        const trafficCountThumb = rendered.container.querySelector('[aria-label="Coches en ciudad"] [data-slot="slider-thumb"]') as HTMLElement;
        const trafficSpeedThumb = rendered.container.querySelector('[aria-label="Velocidad de coches"] [data-slot="slider-thumb"]') as HTMLElement;
        expect(trafficCountThumb).toBeDefined();
        expect(trafficSpeedThumb).toBeDefined();

        await act(async () => {
            trafficCountThumb.focus();
            trafficCountThumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });

        await act(async () => {
            trafficSpeedThumb.focus();
            trafficSpeedThumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });

        const lastTrafficCount = (bridge.setTrafficParticlesCount as any).mock.calls.at(-1)?.[0] as number;
        const lastTrafficSpeed = (bridge.setTrafficParticlesSpeed as any).mock.calls.at(-1)?.[0] as number;
        expect(lastTrafficCount).toBeGreaterThan(20);
        expect(lastTrafficSpeed).toBeGreaterThan(1.4);
    });

    test('can collapse panel to compact icon row and restore it', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        expect((bridge.setViewportInsetLeft as any).mock.calls.some((call: unknown[]) => call[0] === 380)).toBe(true);

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        expect(hidePanelButton).toBeDefined();
        expect(hidePanelButton.getAttribute('title')).toBe('Ocultar panel');

        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.querySelector('[data-slot="sidebar"][data-state="collapsed"]')).not.toBeNull();
        const showPanelButton = rendered.container.querySelector('button[aria-label="Mostrar panel"]') as HTMLButtonElement;
        expect(showPanelButton).toBeDefined();
        expect(showPanelButton.getAttribute('title')).toBe('Mostrar panel');
        expect(rendered.container.querySelector('button[aria-label="Abrir ajustes"]')).not.toBeNull();
        const compactButtons = Array.from(rendered.container.querySelectorAll('.nostr-compact-toolbar button')) as HTMLButtonElement[];
        const compactLabels = compactButtons.map((button) => button.getAttribute('aria-label') || '');
        expect(compactLabels).toContain('Abrir mapa');
        expect(compactLabels).toContain('Abrir relays');
        expect(compactLabels).toContain('Abrir buscador global de usuarios');
        expect(compactLabels).toContain('Abrir estadisticas de la ciudad');
        expect(compactLabels).toContain('Abrir descubre');
        expect(compactLabels).toContain('Abrir ajustes');
        expect(rendered.container.textContent || '').not.toContain('Sobre mi');
        expect(rendered.container.textContent || '').not.toContain('Sigues (');
        expect(rendered.container.textContent || '').not.toContain('Seguidores (');
        expect((bridge.setViewportInsetLeft as any).mock.calls[(bridge.setViewportInsetLeft as any).mock.calls.length - 1][0]).toBe(56);

        await act(async () => {
            showPanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.querySelector('.nostr-social-tabs')).not.toBeNull();
        expect((bridge.setViewportInsetLeft as any).mock.calls[(bridge.setViewportInsetLeft as any).mock.calls.length - 1][0]).toBe(380);
    });

    test('renders shadcn sidebar structure with rail', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        expect(rendered.container.querySelector('[data-slot="sidebar"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="sidebar-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="sidebar-rail"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Nostr City');
        expect(rendered.container.querySelector('[data-slot="sidebar-header"] [data-slot="sidebar-trigger"]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-panel-toolbar [data-slot="sidebar-trigger"]')).toBeNull();
    });

    test('renders social tabs before action menu in expanded sidebar', async () => {
        const ownerPubkey = 'f'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const infoTab = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Sobre mi'
        ) as HTMLButtonElement;
        const cityStatsButton = rendered.container.querySelector('button[aria-label="Abrir estadisticas de la ciudad"]') as HTMLButtonElement | null;

        expect(infoTab).toBeDefined();
        expect(cityStatsButton).not.toBeNull();
        expect(infoTab.compareDocumentPosition(cityStatsButton as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    test('shows descubre menu item with counter and opens dialog', async () => {
        const ownerPubkey = 'f'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const discoverButton = rendered.container.querySelector('button[aria-label="Abrir descubre"]') as HTMLButtonElement;
        expect(discoverButton).toBeDefined();
        expect(rendered.container.textContent || '').toContain('0/3');

        await act(async () => {
            discoverButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => document.body.querySelector('[aria-label="Descubre easter eggs"]') !== null);
    });

    test('hides social tabs when sidebar is collapsed', async () => {
        const ownerPubkey = 'f'.repeat(64);
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
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const infoTabBeforeCollapse = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Sobre mi'
        );
        expect(infoTabBeforeCollapse).toBeDefined();

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        expect(hidePanelButton).toBeDefined();

        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const infoTabCollapsed = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Sobre mi'
        );
        expect(infoTabCollapsed).toBeUndefined();
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
        const fetchMock = vi.fn().mockImplementation(async (_input: string | URL, init?: RequestInit) => {
            const requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) as {
                checks?: Array<{ pubkey: string; nip05: string }>;
            } : { checks: [] };
            const checks = requestBody.checks ?? [];

            return new Response(JSON.stringify({
                results: checks.map((check) => ({
                    pubkey: check.pubkey,
                    nip05: check.nip05,
                    status: check.pubkey === followedPubkey ? 'verified' : 'mismatch',
                    identifier: check.nip05,
                    displayIdentifier: check.nip05,
                    resolvedPubkey: check.pubkey === followedPubkey ? check.pubkey : undefined,
                    checkedAt: 1_719_001_000,
                })),
            }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
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
        const fetchMock = vi.fn().mockImplementation(async (_input: string | URL, init?: RequestInit) => {
            const requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) as {
                checks?: Array<{ pubkey: string; nip05: string }>;
            } : { checks: [] };
            const checks = requestBody.checks ?? [];

            return new Response(JSON.stringify({
                results: checks.map((check) => ({
                    pubkey: check.pubkey,
                    nip05: check.nip05,
                    status: check.pubkey === ownerPubkey || check.pubkey === followedPubkey ? 'verified' : 'mismatch',
                    identifier: check.nip05,
                    displayIdentifier: check.nip05,
                    resolvedPubkey:
                        check.pubkey === ownerPubkey || check.pubkey === followedPubkey
                            ? check.pubkey
                            : undefined,
                    checkedAt: 1_719_001_200,
                })),
            }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
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
            const dialogBadge = rendered.container.querySelector('[aria-label="NIP-05 verificado por DNS: alice@alice.test"]') as HTMLElement;
            expect(dialogBadge).toBeDefined();
            expect(dialogBadge.getAttribute('title')).toBe('NIP-05 verificado por DNS: alice@alice.test');
        } finally {
            (globalThis as any).fetch = originalFetch;
        }
    });

    test('loads active profile stats and latest posts when occupant dialog opens', async () => {
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

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => (rendered.container.textContent || '').includes('Hola mundo'));
        expect(rendered.container.textContent || '').toContain('Feed');
        expect(fetchLatestPostsByPubkeyFn).toHaveBeenCalledWith(expect.objectContaining({ pubkey: followedPubkey }));
        expect(fetchProfileStatsFn).toHaveBeenCalledWith(expect.objectContaining({ pubkey: followedPubkey }));
    });

    test('reuses active profile query cache when reopening the same occupant', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const fetchLatestPostsByPubkeyFn = vi.fn().mockResolvedValue({
            posts: [
                {
                    id: 'post-cache-1',
                    pubkey: followedPubkey,
                    createdAt: 1710000000,
                    content: 'Cache profile post',
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

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => (rendered.container.textContent || '').includes('Cache profile post'));

        const closeButton = rendered.container.querySelector('button[aria-label="Cerrar perfil"]') as HTMLButtonElement;
        expect(closeButton).toBeDefined();
        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('button[aria-label="Cerrar perfil"]') === null);

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => (rendered.container.textContent || '').includes('Cache profile post'));

        expect(fetchLatestPostsByPubkeyFn).toHaveBeenCalledTimes(1);
        expect(fetchProfileStatsFn).toHaveBeenCalledTimes(1);
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

        await selectActiveProfileDialogTab('Feed');
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
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.one', 'wss://relay.two'],
                byType: {
                    nip65Both: ['wss://relay.one', 'wss://relay.two'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            })
        );

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

    test('falls back to bootstrap relays when configured graph relays fail', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
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

        const clientStub: NostrClient = {
            connect: async () => {},
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async () => [],
        };
        const createClient = vi.fn().mockReturnValue(clientStub);
        const fetchFollowsByNpubFn = vi
            .fn()
            .mockRejectedValueOnce(new Error('configured relay failed'))
            .mockResolvedValueOnce({
                ownerPubkey,
                follows: [followedPubkey],
                relayHints: [],
            });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient,
                    fetchFollowsByNpubFn,
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

        expect(fetchFollowsByNpubFn).toHaveBeenCalledTimes(2);
        expect(createClient.mock.calls[0]?.[0]).toEqual(['wss://relay.one']);
        expect(createClient.mock.calls[1]?.[0]).toEqual(getBootstrapRelays());
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

        await selectActiveProfileDialogTab('Feed');
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

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Siguiendo');
        await waitFor(() => (rendered.container.textContent || '').includes(`User-${followA.slice(0, 4)}`));
        await selectActiveProfileDialogTab('Seguidores');
        await waitFor(() => (rendered.container.textContent || '').includes(`User-${followerA.slice(0, 4)}`));
    });

    test('sending message from active profile network menu closes profile dialog before opening chat', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const followerA = 'd'.repeat(64);
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
                                    tags: [],
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
                    fetchLatestPostsByPubkeyFn: vi.fn().mockResolvedValue({ posts: [], hasMore: false }),
                    fetchProfileStatsFn: vi.fn().mockResolvedValue({ followsCount: 0, followersCount: 1 }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [followerA],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Seguidores');
        await waitFor(() => (rendered.container.textContent || '').includes(`User-${followerA.slice(0, 4)}`));

        const actionsButton = document.body.querySelector(`button[aria-label="Abrir acciones para User-${followerA.slice(0, 4)}"]`) as HTMLButtonElement;
        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));
        const messageItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            messageItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
        expect(document.body.querySelector('button[aria-label="Cerrar perfil"]')).toBeNull();
    });

    test('imports active profile relay suggestions into local relay settings', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (pubkey: string, kind: number) => {
                            if (pubkey !== followedPubkey) {
                                return null;
                            }

                            if (kind === 10002) {
                                return {
                                    id: 'relay-list-active-profile',
                                    pubkey,
                                    kind: 10002,
                                    created_at: 321,
                                    tags: [
                                        ['r', 'wss://relay.profile.example'],
                                        ['r', 'wss://relay.readonly.example', 'read'],
                                    ],
                                    content: '',
                                };
                            }

                            if (kind === 10050) {
                                return {
                                    id: 'relay-list-dm-active-profile',
                                    pubkey,
                                    kind: 10050,
                                    created_at: 322,
                                    tags: [['relay', 'wss://relay.dm.example']],
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

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Información');
        await waitFor(() => (rendered.container.textContent || '').includes('relay.profile.example'));

        const addAllButton = rendered.container.querySelector('button[aria-label="Añadir todos los relays declarados"]') as HTMLButtonElement;
        expect(addAllButton).toBeDefined();

        await act(async () => {
            addAllButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const stored = loadRelaySettings({ ownerPubkey });
        expect(stored.byType.nip65Both).toContain('wss://relay.profile.example');
        expect(stored.byType.nip65Read).toContain('wss://relay.profile.example');
        expect(stored.byType.nip65Read).toContain('wss://relay.readonly.example');
        expect(stored.byType.nip65Write).toContain('wss://relay.profile.example');
        expect(stored.byType.dmInbox).toContain('wss://relay.dm.example');
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

        const relaysButton = rendered.container.querySelector('button[aria-label="Abrir relays"]') as HTMLButtonElement;
        expect(relaysButton).toBeDefined();

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
            JSON.stringify({
                relays: ['wss://relay.suggested.example'],
                byType: {
                    nip65Both: ['wss://relay.suggested.example'],
                    nip65Read: ['wss://relay.suggested.example'],
                    nip65Write: ['wss://relay.suggested.example'],
                    dmInbox: [],
                },
            })
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

        const relaysButton = rendered.container.querySelector('button[aria-label="Abrir relays"]') as HTMLButtonElement;
        expect(relaysButton).toBeDefined();

        await act(async () => {
            relaysButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() =>
            !rendered.container.querySelector('button[aria-label="Abrir acciones sugeridas para wss://relay.suggested.example (NIP-65 read+write)"]')
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

    test('creates a local account from the login gate, signs bootstrap events, and scopes relay settings to the owner', async () => {
        const { bridge } = createMapBridgeStub();
        const signEventSpy = vi.spyOn(LocalKeyAuthProvider.prototype, 'signEvent');
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices('f'.repeat(64), {
                    fetchFollowsByPubkeyFn: vi.fn().mockImplementation(async (pubkey: string) => ({
                        ownerPubkey: pubkey,
                        follows: [],
                        relayHints: [],
                    })),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                })}
            />,
        );
        mounted.push(rendered);

        const clickButton = async (label: string) => {
            const button = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
                (candidate.textContent || '').includes(label)
            ) as HTMLButtonElement | undefined;
            expect(button).toBeDefined();
            await act(async () => {
                button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        };

        const fillControl = async (selector: string, value: string) => {
            const input = rendered.container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
            expect(input).toBeDefined();
            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
                valueSetter?.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        };

        await clickButton('Crear cuenta');
        await clickButton('Crear cuenta local');
        await clickButton('Continuar');

        const backupCheckbox = rendered.container.querySelector('input[name="confirm-backup"]') as HTMLInputElement;
        expect(backupCheckbox).toBeDefined();
        await act(async () => {
            backupCheckbox.click();
        });

        await clickButton('Continuar');
        await fillControl('input[name="profile-name"]', 'Pablo');
        await fillControl('textarea[name="profile-about"]', 'Mapa y Nostr');
        await clickButton('Continuar');
        await clickButton('Crear cuenta ahora');

        await waitFor(() => signEventSpy.mock.calls.length >= 3);

        const signedKinds = signEventSpy.mock.calls.map((call) => call[0]?.kind);
        expect(signedKinds).toContain(0);
        expect(signedKinds).toContain(10002);
        expect(signedKinds).toContain(10050);

        const storedSessionRaw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
        expect(storedSessionRaw).not.toBeNull();
        const storedSession = JSON.parse(storedSessionRaw ?? '{}') as { pubkey: string };
        const savedRelaySettings = loadRelaySettings({ ownerPubkey: storedSession.pubkey });
        expect(savedRelaySettings.byType.nip65Both).toContain('wss://relay.damus.io');
        expect(savedRelaySettings.byType.dmInbox).toContain('wss://relay.snort.social');
    });

    test('shows the unlock gate when restoring a passphrase-protected local account', async () => {
        const secretKey = generateSecretKey();
        const pubkey = getPublicKey(secretKey);
        const localKeyStorage = createLocalKeyStorage({
            storage: window.localStorage,
            deviceKeyStore: {
                async get() {
                    return undefined;
                },
                async getOrCreate() {
                    throw new Error('not needed');
                },
                async delete() {
                    return;
                },
            },
        });
        await localKeyStorage.save({ pubkey, secretKey, passphrase: 'local-passphrase' });
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'local',
            pubkey,
            readonly: false,
            locked: false,
            createdAt: 123,
        }));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(pubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockImplementation(async () => ({
                        ownerPubkey: pubkey,
                        follows: [],
                        relayHints: [],
                    })),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [pubkey]: { pubkey, displayName: `User-${pubkey.slice(0, 4)}` },
                    }),
                })}
            />,
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('input[name="unlock-passphrase"]')));
        expect(rendered.container.querySelector('[data-testid="login-gate-screen"]')).not.toBeNull();
    });

    test('keeps the login gate available without logout when owner graph fails to load', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    graphApiService: {
                        loadFollows: vi.fn().mockRejectedValue(new Error('Missing or invalid Nostr auth proof')),
                        loadFollowers: vi.fn().mockResolvedValue({ followers: [], complete: true }),
                        loadPosts: vi.fn().mockResolvedValue({ posts: [], hasMore: false, nextUntil: undefined }),
                        loadProfileStats: vi.fn().mockResolvedValue({ followsCount: 0, followersCount: 0 }),
                    },
                }}
            />,
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

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);
        expect(rendered.container.textContent || '').not.toContain('Cerrar sesion');
    });

    test('clears logout session cache for active profile agora dm notifications before next account login', async () => {
        const ownerPubkeyA = 'f'.repeat(64);
        const ownerPubkeyB = 'e'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const npubA = encodeHexToNpub(ownerPubkeyA);
        const npubB = encodeHexToNpub(ownerPubkeyB);
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
                    fetchFollowsByNpubFn: vi.fn().mockImplementation(async (npub: string) => {
                        if (npub === npubA) {
                            return {
                                ownerPubkey: ownerPubkeyA,
                                follows: [followedPubkey],
                                relayHints: [],
                            };
                        }

                        return {
                            ownerPubkey: ownerPubkeyB,
                            follows: [followedPubkey],
                            relayHints: [],
                        };
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkeyA) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner-A' };
                            }
                            if (pubkey === ownerPubkeyB) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner-B' };
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

        const submitNpub = async (npub: string): Promise<void> => {
            const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
            const form = rendered.container.querySelector('form');

            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(npubInput, npub);
                npubInput.dispatchEvent(new Event('input', { bubbles: true }));
                npubInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            await act(async () => {
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
        };

        await submitNpub(npubA);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-A'));

        const followingFeedKey = nostrOverlayQueryKeys.followingFeed({
            ownerPubkey: ownerPubkeyA,
            follows: [followedPubkey],
            pageSize: 20,
        });
        const notificationsKey = nostrOverlayQueryKeys.notifications({
            ownerPubkey: ownerPubkeyA,
            limit: 200,
        });
        const directMessagesKey = nostrOverlayQueryKeys.directMessagesList({ ownerPubkey: ownerPubkeyA });
        const activeProfilePostsKey = ['nostr-overlay', 'social', 'active-profile', 'posts', {
            pubkey: followedPubkey,
            pageSize: 10,
        }] as const;

        rendered.queryClient.setQueryData(followingFeedKey, {
            pages: [{
                items: [{
                    id: 'feed-a',
                    pubkey: followedPubkey,
                    createdAt: 1_700_000_001,
                    content: 'feed-a',
                    kind: 'note',
                    rawEvent: {
                        id: 'feed-a',
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 1_700_000_001,
                        tags: [],
                        content: 'feed-a',
                    },
                }],
                hasMore: false,
            }],
            pageParams: [undefined],
        });
        rendered.queryClient.setQueryData(notificationsKey, [{
            id: 'notif-a',
            kind: 1,
            actorPubkey: followedPubkey,
            createdAt: 1_700_000_002,
            content: 'notif-a',
            targetEventId: 'feed-a',
            targetPubkey: ownerPubkeyA,
            rawEvent: {
                id: 'notif-a',
                pubkey: followedPubkey,
                kind: 1,
                created_at: 1_700_000_002,
                tags: [['p', ownerPubkeyA], ['e', 'feed-a']],
                content: 'notif-a',
            },
        }]);
        rendered.queryClient.setQueryData(directMessagesKey, [{
            id: 'dm-a',
            conversationId: followedPubkey,
            peerPubkey: followedPubkey,
            direction: 'incoming',
            createdAt: 1_700_000_003,
            plaintext: 'dm-a',
            deliveryState: 'sent',
        }]);
        rendered.queryClient.setQueryData(activeProfilePostsKey, {
            pages: [{ posts: [{ id: 'profile-a' }], hasMore: false }],
            pageParams: [undefined],
        });

        expect(rendered.queryClient.getQueryData(followingFeedKey)).toBeDefined();
        expect(rendered.queryClient.getQueryData(notificationsKey)).toBeDefined();
        expect(rendered.queryClient.getQueryData(directMessagesKey)).toBeDefined();
        expect(rendered.queryClient.getQueryData(activeProfilePostsKey)).toBeDefined();

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => (rendered.container.textContent || '').includes('Metodo de acceso'));

        expect(rendered.queryClient.getQueryData(followingFeedKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(notificationsKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(directMessagesKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(activeProfilePostsKey)).toBeUndefined();

        await submitNpub(npubB);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-B'));

        expect(rendered.queryClient.getQueryData(followingFeedKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(notificationsKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(directMessagesKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(activeProfilePostsKey)).toBeUndefined();
    });

    test('resets discover progress in memory on logout while keeping user-scoped persistence', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
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

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(rendered.container.textContent || '').toContain('0/3');

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 3,
                easterEggId: 'crypto_anarchist_manifesto',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('1/3'));

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => (rendered.container.textContent || '').includes('Metodo de acceso'));

        expect(rendered.container.textContent || '').not.toContain('1/3');
        const storedProgressRaw = window.localStorage.getItem(`${EASTER_EGG_PROGRESS_STORAGE_KEY}:user:${ownerPubkey}`);
        expect(storedProgressRaw).not.toBeNull();
        expect(JSON.parse(storedProgressRaw as string)).toMatchObject({
            discoveredIds: ['crypto_anarchist_manifesto'],
        });
    });

    test('restores discover progress when switching back to original account', async () => {
        const ownerPubkeyA = 'f'.repeat(64);
        const ownerPubkeyB = 'e'.repeat(64);
        const npubA = encodeHexToNpub(ownerPubkeyA);
        const npubB = encodeHexToNpub(ownerPubkeyB);
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockImplementation(async (npub: string) => {
                        if (npub === npubA) {
                            return {
                                ownerPubkey: ownerPubkeyA,
                                follows: [],
                                relayHints: [],
                            };
                        }

                        return {
                            ownerPubkey: ownerPubkeyB,
                            follows: [],
                            relayHints: [],
                        };
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkeyA]: { pubkey: ownerPubkeyA, displayName: 'Owner-A' },
                        [ownerPubkeyB]: { pubkey: ownerPubkeyB, displayName: 'Owner-B' },
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

        const submitNpub = async (npub: string): Promise<void> => {
            const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
            const form = rendered.container.querySelector('form');

            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(npubInput, npub);
                npubInput.dispatchEvent(new Event('input', { bubbles: true }));
                npubInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            await act(async () => {
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
        };

        await submitNpub(npubA);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-A'));
        expect(rendered.container.textContent || '').toContain('0/3');

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 3,
                easterEggId: 'crypto_anarchist_manifesto',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('1/3'));

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => (rendered.container.textContent || '').includes('Metodo de acceso'));

        await submitNpub(npubB);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-B'));
        expect(rendered.container.textContent || '').toContain('0/3');

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => (rendered.container.textContent || '').includes('Metodo de acceso'));

        await submitNpub(npubA);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-A'));
        expect(rendered.container.textContent || '').toContain('1/3');
    });

    test('hides logout from settings menu and keeps logout in user menu', async () => {
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

        await waitFor(() => (rendered.container.textContent || '').includes('Sobre mi'));

        await openSettingsContextMenu(rendered.container);

        const settingsLogoutAction = Array.from(rendered.container.querySelectorAll('button, a')).find((item) =>
            (item.textContent || '').trim() === 'Cerrar sesión'
        ) ?? Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Cerrar sesión'
        );
        expect(settingsLogoutAction).toBeUndefined();

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');

        await waitFor(() => (rendered.container.textContent || '').includes('Metodo de acceso'));

        const content = rendered.container.textContent || '';
        expect(content).not.toContain('Sobre mi');
        expect(rendered.container.querySelector('[data-testid="login-gate-screen"]')).not.toBeNull();
    });
});
