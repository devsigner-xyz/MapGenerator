import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { App } from './App';
import type { MapBridge } from './map-bridge';
import { assignPubkeysToBuildings } from '../nostr/domain/assignment';

function createMapBridgeStub(buildingsCount: number): { bridge: MapBridge; triggerMapGenerated: () => void } {
    const listeners: Array<() => void> = [];

    const bridge: MapBridge = {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue(
            Array.from({ length: buildingsCount }, (_, index) => ({
                index,
                centroid: { x: index * 10, y: index * 10 },
            }))
        ),
        applyOccupancy: vi.fn(),
        focusBuilding: vi.fn(),
        onMapGenerated: vi.fn().mockImplementation((listener: () => void) => {
            listeners.push(listener);
            return () => {
                const idx = listeners.indexOf(listener);
                if (idx >= 0) {
                    listeners.splice(idx, 1);
                }
            };
        }),
    };

    return {
        bridge,
        triggerMapGenerated: () => {
            listeners.forEach(listener => listener());
        },
    };
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
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

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
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

describe('Nostr overlay selection map interaction', () => {
    test('selecting a person focuses and highlights assigned building', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const pubkeyA = 'a'.repeat(64);
        const pubkeyB = 'b'.repeat(64);
        const { bridge, triggerMapGenerated } = createMapBridgeStub(3);

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
                        follows: [pubkeyA, pubkeyB],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [pubkeyA]: { pubkey: pubkeyA, displayName: 'Alice' },
                        [pubkeyB]: { pubkey: pubkeyB, displayName: 'Bob' },
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
        await flush();

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const aliceButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Alice')
        );
        expect(aliceButton).toBeDefined();

        await act(async () => {
            aliceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const assignment = assignPubkeysToBuildings({
            pubkeys: [pubkeyA, pubkeyB],
            buildingsCount: 3,
            seed: ownerPubkey,
        });
        const assignedIndex = assignment.pubkeyToBuildingIndex[pubkeyA];

        expect((bridge.focusBuilding as any).mock.calls[0][0]).toBe(assignedIndex);

        const calls = (bridge.applyOccupancy as any).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.selectedBuildingIndex).toBe(assignedIndex);

        await act(async () => {
            triggerMapGenerated();
        });
        const callsAfterRegeneration = (bridge.applyOccupancy as any).mock.calls;
        const lastRegenerationCall = callsAfterRegeneration[callsAfterRegeneration.length - 1][0];
        expect(lastRegenerationCall.byBuildingIndex).toBeDefined();
        expect(Object.keys(lastRegenerationCall.byBuildingIndex).length).toBeGreaterThan(0);
    });
});
