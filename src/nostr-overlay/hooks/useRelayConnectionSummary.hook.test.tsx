/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test } from 'vitest';
import { useRelayConnectionSummary } from './useRelayConnectionSummary';

interface RenderSampleProps {
    relayUrl: string;
}

function RenderSample({ relayUrl }: RenderSampleProps) {
    const summary = useRelayConnectionSummary([relayUrl], {
        probe: async () => false,
        refreshIntervalMs: 0,
        skipWhenHidden: false,
    });

    return (
        <div
            data-total={summary.totalRelays}
            data-checking={summary.checkingRelays}
            data-connected={summary.connectedRelays}
        />
    );
}

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
    for (const entry of mountedRoots) {
        entry.root.unmount();
        entry.container.remove();
    }
    mountedRoots.length = 0;
});

describe('useRelayConnectionSummary hook', () => {
    test('supports inline relay arrays without entering a render loop', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        mountedRoots.push({ root, container });

        await act(async () => {
            root.render(<RenderSample relayUrl="wss://relay.example" />);
        });

        await act(async () => {
            await Promise.resolve();
        });

        const view = container.querySelector('div');
        expect(view).toBeDefined();
        expect(view?.getAttribute('data-total')).toBe('1');
        expect(view?.getAttribute('data-checking')).toBe('0');
        expect(view?.getAttribute('data-connected')).toBe('0');
    });
});
