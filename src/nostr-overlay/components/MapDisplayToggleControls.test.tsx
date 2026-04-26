import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { MapDisplayToggleControls } from './MapDisplayToggleControls';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <MapDisplayToggleControls
                carsEnabled
                streetLabelsEnabled
                specialMarkersEnabled
                onCarsEnabledChange={vi.fn()}
                onStreetLabelsEnabledChange={vi.fn()}
                onSpecialMarkersEnabledChange={vi.fn()}
            />
        );
    });

    return { container, root } satisfies RenderResult;
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('MapDisplayToggleControls', () => {
    test('renders english toggle labels when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[aria-label="Map display controls"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Toggle map cars"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[title="Cars"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Toggle street labels"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Toggle special icons"]')).not.toBeNull();
    });

    test('separates toggle group items with shadcn spacing', async () => {
        const rendered = await renderElement();
        mounted.push(rendered);

        const toggleGroup = rendered.container.querySelector('[data-slot="toggle-group"]');

        expect(toggleGroup?.getAttribute('data-spacing')).toBe('1');
    });
});
