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
});
