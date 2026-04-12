import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { NostrProfile } from '../../nostr/types';
import { MapPresenceLayer } from './MapPresenceLayer';
import type { MapBridge } from '../map-bridge';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

function createMapBridgeStub(zoom: number): MapBridge {
    return {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([
            {
                index: 0,
                centroid: { x: 100, y: 80 },
            },
        ]),
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
        listEasterEggBuildings: vi.fn().mockReturnValue([]),
        listSpecialBuildings: vi.fn().mockReturnValue([]),
        getParkCount: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingContextMenu: vi.fn().mockReturnValue(() => {}),
        onSpecialBuildingClick: vi.fn().mockReturnValue(() => {}),
        getZoom: vi.fn().mockReturnValue(zoom),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    };
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

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('MapPresenceLayer', () => {
    const occupantPubkey = 'a'.repeat(64);
    const ownerPubkey = 'f'.repeat(64);

    const profiles: Record<string, NostrProfile> = {
        [occupantPubkey]: {
            pubkey: occupantPubkey,
            displayName: 'Alice',
        },
    };

    test('shows owner tooltip regardless of zoom threshold', async () => {
        const bridge = createMapBridgeStub(3);
        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{}}
                discoveredEasterEggIds={[]}
                profiles={profiles}
                ownerPubkey={ownerPubkey}
                ownerProfile={{ pubkey: ownerPubkey, displayName: 'Owner' }}
                ownerBuildingIndex={0}
                occupiedLabelsZoomLevel={10}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('You are here');
        const ownerAvatar = rendered.container.querySelector('.nostr-map-owner-avatar-fallback') as HTMLElement;
        expect(ownerAvatar).toBeDefined();
        expect(ownerAvatar.textContent || '').toContain('OW');
    });

    test('hides occupied labels below configured zoom level', async () => {
        const bridge = createMapBridgeStub(9);
        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{ 0: occupantPubkey }}
                discoveredEasterEggIds={[]}
                profiles={profiles}
                ownerPubkey={ownerPubkey}
                ownerProfile={{ pubkey: ownerPubkey, displayName: 'Owner' }}
                ownerBuildingIndex={0}
                occupiedLabelsZoomLevel={10}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Alice');
    });

    test('shows occupied labels at configured zoom level', async () => {
        const bridge = createMapBridgeStub(10);
        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{ 0: occupantPubkey }}
                discoveredEasterEggIds={[]}
                profiles={profiles}
                ownerPubkey={ownerPubkey}
                ownerProfile={{ pubkey: ownerPubkey, displayName: 'Owner' }}
                ownerBuildingIndex={0}
                occupiedLabelsZoomLevel={10}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Alice');
    });

    test('shows featured occupied labels below configured zoom level', async () => {
        const bridge = createMapBridgeStub(3);
        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{ 0: occupantPubkey }}
                discoveredEasterEggIds={[]}
                profiles={profiles}
                ownerPubkey={ownerPubkey}
                ownerProfile={{ pubkey: ownerPubkey, displayName: 'Owner' }}
                ownerBuildingIndex={0}
                occupiedLabelsZoomLevel={10}
                alwaysVisiblePubkeys={[occupantPubkey]}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Alice');
    });

    test('renders avatar-only occupant tag when username is empty', async () => {
        const bridge = createMapBridgeStub(10);
        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{ 0: occupantPubkey }}
                discoveredEasterEggIds={[]}
                profiles={{
                    [occupantPubkey]: {
                        pubkey: occupantPubkey,
                        displayName: '',
                        name: '',
                        picture: 'https://example.com/avatar.png',
                    },
                }}
                ownerPubkey={ownerPubkey}
                ownerProfile={{ pubkey: ownerPubkey, displayName: 'Owner' }}
                ownerBuildingIndex={0}
                occupiedLabelsZoomLevel={10}
            />
        );
        mounted.push(rendered);

        const tag = rendered.container.querySelector('.nostr-map-occupant-tag') as HTMLElement;
        expect(tag).toBeDefined();
        expect(tag.classList.contains('nostr-map-occupant-tag-no-name')).toBe(true);
        expect(rendered.container.querySelector('.nostr-map-occupant-name')).toBeNull();
    });

    test('clips labels out of left panel inset area', async () => {
        const bridge = createMapBridgeStub(10);
        (bridge.getViewportInsetLeft as any).mockReturnValue(180);
        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{ 0: occupantPubkey }}
                discoveredEasterEggIds={[]}
                profiles={profiles}
                ownerPubkey={ownerPubkey}
                ownerProfile={{ pubkey: ownerPubkey, displayName: 'Owner' }}
                ownerBuildingIndex={0}
                occupiedLabelsZoomLevel={8}
            />
        );
        mounted.push(rendered);

        const layer = rendered.container.querySelector('.nostr-map-presence-layer') as HTMLDivElement;
        expect(layer).toBeDefined();
        expect(layer.style.clipPath).toBe('inset(0 0 0 180px)');
    });

    test('does not hit maximum update depth when listBuildings returns fresh arrays', async () => {
        const bridge = createMapBridgeStub(10);
        (bridge.listBuildings as any).mockImplementation(() => [
            {
                index: 0,
                centroid: { x: 100, y: 80 },
            },
        ]);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const rendered = await renderElement(
                <MapPresenceLayer
                    mapBridge={bridge}
                    occupancyByBuildingIndex={{ 0: occupantPubkey }}
                    discoveredEasterEggIds={[]}
                    profiles={profiles}
                    ownerPubkey={ownerPubkey}
                    ownerProfile={{ pubkey: ownerPubkey, displayName: 'Owner' }}
                    ownerBuildingIndex={0}
                    occupiedLabelsZoomLevel={8}
                />
            );
            mounted.push(rendered);

            await act(async () => {
                await Promise.resolve();
            });

            const hasMaximumDepthError = consoleErrorSpy.mock.calls.some((callArgs) =>
                callArgs.some((value) => typeof value === 'string' && value.includes('Maximum update depth exceeded'))
            );
            expect(hasMaximumDepthError).toBe(false);
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    test('does not hit maximum update depth when listEasterEggBuildings returns fresh arrays', async () => {
        const bridge = createMapBridgeStub(10);
        (bridge.listEasterEggBuildings as any).mockImplementation((): Array<{ index: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }> => []);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const rendered = await renderElement(
                <MapPresenceLayer
                    mapBridge={bridge}
                    occupancyByBuildingIndex={{ 0: occupantPubkey }}
                    discoveredEasterEggIds={[]}
                    profiles={profiles}
                    ownerPubkey={ownerPubkey}
                    ownerProfile={{ pubkey: ownerPubkey, displayName: 'Owner' }}
                    ownerBuildingIndex={0}
                    occupiedLabelsZoomLevel={8}
                />
            );
            mounted.push(rendered);

            await act(async () => {
                await Promise.resolve();
            });

            const hasMaximumDepthError = consoleErrorSpy.mock.calls.some((callArgs) =>
                callArgs.some((value) => typeof value === 'string' && value.includes('Maximum update depth exceeded'))
            );
            expect(hasMaximumDepthError).toBe(false);
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    test('renders persistent discovered easter egg marker', async () => {
        const bridge = createMapBridgeStub(4);
        (bridge.listBuildings as any).mockReturnValue([
            {
                index: 5,
                centroid: { x: 120, y: 90 },
            },
        ]);
        (bridge.listEasterEggBuildings as any).mockReturnValue([
            {
                index: 5,
                easterEggId: 'crypto_anarchist_manifesto',
            },
        ]);

        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{}}
                discoveredEasterEggIds={['crypto_anarchist_manifesto']}
                profiles={profiles}
                occupiedLabelsZoomLevel={10}
            />
        );
        mounted.push(rendered);

        const marker = rendered.container.querySelector('.nostr-map-easter-egg-marker') as HTMLElement;
        expect(marker).toBeDefined();
        expect(marker.textContent || '').toContain('★');
    });

    test('renders reserved special building marker', async () => {
        const bridge = createMapBridgeStub(4);
        (bridge.listBuildings as any).mockReturnValue([
            {
                index: 2,
                centroid: { x: 180, y: 120 },
            },
        ]);
        (bridge.listSpecialBuildings as any).mockReturnValue([
            {
                index: 2,
                specialBuildingId: 'agora',
            },
        ]);

        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{}}
                discoveredEasterEggIds={[]}
                profiles={profiles}
                occupiedLabelsZoomLevel={10}
            />
        );
        mounted.push(rendered);

        const marker = rendered.container.querySelector('.nostr-map-special-building-marker') as HTMLElement;
        expect(marker).toBeDefined();
        expect(marker.textContent || '').toContain('A');
    });

    test('hides easter egg and special markers when special markers toggle is disabled', async () => {
        const bridge = createMapBridgeStub(4);
        (bridge.listBuildings as any).mockReturnValue([
            {
                index: 5,
                centroid: { x: 120, y: 90 },
            },
            {
                index: 7,
                centroid: { x: 180, y: 90 },
            },
        ]);
        (bridge.listEasterEggBuildings as any).mockReturnValue([
            {
                index: 5,
                easterEggId: 'crypto_anarchist_manifesto',
            },
        ]);
        (bridge.listSpecialBuildings as any).mockReturnValue([
            {
                index: 7,
                specialBuildingId: 'agora',
            },
        ]);

        const rendered = await renderElement(
            <MapPresenceLayer
                mapBridge={bridge}
                occupancyByBuildingIndex={{}}
                discoveredEasterEggIds={['crypto_anarchist_manifesto']}
                profiles={profiles}
                occupiedLabelsZoomLevel={10}
                specialMarkersEnabled={false}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-map-easter-egg-marker')).toBeNull();
        expect(rendered.container.querySelector('.nostr-map-special-building-marker')).toBeNull();
    });
});
