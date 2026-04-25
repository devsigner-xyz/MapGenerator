import { type ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { EasterEggBuildingClickPayload, MapBridge } from '../map-bridge';
import { useEasterEggDiscoveryController } from './useEasterEggDiscoveryController';

interface RenderResult {
    root: Root;
    container: HTMLDivElement;
}

function createMapBridgeStub() {
    let easterEggListener: ((payload: EasterEggBuildingClickPayload) => void) | undefined;
    const bridge = {
        onEasterEggBuildingClick(listener: (payload: EasterEggBuildingClickPayload) => void) {
            easterEggListener = listener;
            return () => {
                easterEggListener = undefined;
            };
        },
    } as MapBridge;

    return {
        bridge,
        triggerEasterEggBuildingClick(payload: EasterEggBuildingClickPayload) {
            easterEggListener?.(payload);
        },
    };
}

async function render(element: ReactNode): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { root, container };
}

async function unmount(rendered: RenderResult): Promise<void> {
    await act(async () => {
        rendered.root.unmount();
    });
    rendered.container.remove();
}

function ControllerHarness({
    mapBridge,
    ownerPubkey,
    onReady,
}: Parameters<typeof useEasterEggDiscoveryController>[0] & {
    onReady: (controller: ReturnType<typeof useEasterEggDiscoveryController>) => void;
}) {
    const controller = useEasterEggDiscoveryController({
        mapBridge,
        ...(ownerPubkey ? { ownerPubkey } : {}),
    });
    onReady(controller);
    return null;
}

describe('useEasterEggDiscoveryController', () => {
    const mounted: RenderResult[] = [];

    beforeAll(() => {
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(async () => {
        while (mounted.length > 0) {
            const rendered = mounted.pop();
            if (rendered) {
                await unmount(rendered);
            }
        }
        localStorage.clear();
    });

    test('opens the easter egg dialog and celebrates only the first discovery', async () => {
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub();
        let controller: ReturnType<typeof useEasterEggDiscoveryController> | undefined;
        const rendered = await render(
            <ControllerHarness
                mapBridge={bridge}
                ownerPubkey={'f'.repeat(64)}
                onReady={(nextController) => {
                    controller = nextController;
                }}
            />
        );
        mounted.push(rendered);

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 7,
                easterEggId: 'bitcoin_whitepaper',
            });
        });

        expect(controller?.easterEggProgress.discoveredIds).toEqual(['bitcoin_whitepaper']);
        expect(controller?.activeEasterEgg?.buildingIndex).toBe(7);
        expect(controller?.easterEggCelebrationNonce).toBe(1);

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 7,
                easterEggId: 'bitcoin_whitepaper',
            });
        });

        expect(controller?.easterEggProgress.discoveredIds).toEqual(['bitcoin_whitepaper']);
        expect(controller?.activeEasterEgg?.buildingIndex).toBe(7);
        expect(controller?.easterEggCelebrationNonce).toBe(1);
    });

    test('resets progress and active dialog when requested', async () => {
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub();
        let controller: ReturnType<typeof useEasterEggDiscoveryController> | undefined;
        const rendered = await render(
            <ControllerHarness
                mapBridge={bridge}
                onReady={(nextController) => {
                    controller = nextController;
                }}
            />
        );
        mounted.push(rendered);

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 3,
                easterEggId: 'cyberspace_independence',
            });
        });

        expect(controller?.easterEggProgress.discoveredIds).toEqual(['cyberspace_independence']);
        expect(controller?.activeEasterEgg).not.toBeNull();

        await act(async () => {
            controller?.resetEasterEggProgress();
        });

        expect(controller?.easterEggProgress.discoveredIds).toEqual([]);
        expect(controller?.activeEasterEgg).toBeNull();
    });
});
