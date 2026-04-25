import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { OverlayAppShell } from './OverlayAppShell';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

let mounted: RenderResult | null = null;

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function render(element: ReactElement): RenderResult {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(element);
    });

    mounted = { container, root };
    return mounted;
}

afterEach(() => {
    if (!mounted) {
        return;
    }

    const { container, root } = mounted;
    act(() => {
        root.unmount();
    });
    container.remove();
    mounted = null;
});

describe('OverlayAppShell', () => {
    test('renders the overlay container with sidebar, map controls, main content, and dialogs', () => {
        const { container } = render(
            <OverlayAppShell
                sidebar={<aside data-testid="stub-sidebar" />}
                mapControls={<div data-testid="stub-map-controls" />}
                main={<main data-testid="stub-main" />}
                dialogs={<div data-testid="stub-dialogs" />}
            />,
        );

        const shell = container.querySelector('.nostr-overlay-shell');

        expect(shell).toBeInstanceOf(HTMLDivElement);
        expect(shell?.contains(container.querySelector('[data-testid="stub-sidebar"]'))).toBe(true);
        expect(shell?.contains(container.querySelector('[data-testid="stub-map-controls"]'))).toBe(true);
        expect(shell?.contains(container.querySelector('[data-testid="stub-main"]'))).toBe(true);
        expect(shell?.contains(container.querySelector('[data-testid="stub-dialogs"]'))).toBe(true);
    });
});
