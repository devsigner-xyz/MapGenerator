import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { UiTheme } from '../../nostr/ui-settings';
import { useOverlayTheme } from './useOverlayTheme';

interface RenderResult {
    root: Root;
    container: HTMLDivElement;
}

function Harness({ theme }: { theme: UiTheme }) {
    useOverlayTheme(theme);
    return null;
}

async function renderHarness(theme: UiTheme): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<Harness theme={theme} />);
    });

    return { root, container };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    document.head.querySelectorAll('link[rel="icon"]').forEach((node) => node.remove());
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';

    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('useOverlayTheme', () => {
    test('updates the favicon to the dark icon when dark mode is selected', async () => {
        const initialIcon = document.createElement('link');
        initialIcon.rel = 'icon';
        initialIcon.href = '/icon-light-32x32.png';
        document.head.appendChild(initialIcon);

        const rendered = await renderHarness('dark');
        mounted.push(rendered);

        const activeIcon = document.head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
        expect(activeIcon?.getAttribute('href')).toBe('/icon-dark-32x32.png');
    });

    test('updates the favicon to the light icon when light mode is selected', async () => {
        const initialIcon = document.createElement('link');
        initialIcon.rel = 'icon';
        initialIcon.href = '/icon-dark-32x32.png';
        document.head.appendChild(initialIcon);

        const rendered = await renderHarness('light');
        mounted.push(rendered);

        const activeIcon = document.head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
        expect(activeIcon?.getAttribute('href')).toBe('/icon-light-32x32.png');
    });
});
