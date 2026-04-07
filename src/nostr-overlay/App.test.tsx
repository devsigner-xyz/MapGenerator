import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { App } from './App';
import type { MapBridge } from './map-bridge';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

function createMapBridgeStub(): MapBridge {
    return {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([]),
        applyOccupancy: vi.fn(),
        focusBuilding: vi.fn(),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
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

describe('Nostr overlay App', () => {
    test('shows npub form and empty following list before login', async () => {
        const bridge = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} />);
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]');
        const emptyMessage = rendered.container.textContent || '';

        expect(npubInput).not.toBeNull();
        expect(emptyMessage).toContain('No hay cuentas seguidas');
    });
});
