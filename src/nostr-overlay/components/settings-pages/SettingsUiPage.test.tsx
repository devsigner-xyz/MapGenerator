import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { getDefaultUiSettings } from '../../../nostr/ui-settings';
import { SettingsUiPage } from './SettingsUiPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderPage(): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<SettingsUiPage uiSettings={getDefaultUiSettings()} onPersistUiSettings={vi.fn()} />);
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }

    if (!Element.prototype.hasPointerCapture) {
        Element.prototype.hasPointerCapture = () => false;
    }

    if (!Element.prototype.setPointerCapture) {
        Element.prototype.setPointerCapture = () => {};
    }

    if (!Element.prototype.releasePointerCapture) {
        Element.prototype.releasePointerCapture = () => {};
    }
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

describe('SettingsUiPage', () => {
    test('renders stable rows for the primary ui controls', async () => {
        const rendered = await renderPage();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="settings-page-body"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-page-body"]')?.className).toContain('nostr-settings-body');
        expect(rendered.container.querySelector('.nostr-settings-form')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-ui-theme-row"]')?.className).toContain('nostr-settings-section');
        expect(rendered.container.querySelector('[data-testid="settings-ui-theme-row"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-ui-occupied-zoom-row"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-ui-street-labels-row"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-ui-traffic-speed-row"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Interfaz');
    });

    test('renders theme controls and persists selected theme', async () => {
        const onPersistUiSettings = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <SettingsUiPage
                    uiSettings={{
                        ...getDefaultUiSettings(),
                        theme: 'system',
                    }}
                    onPersistUiSettings={onPersistUiSettings}
                />
            );
        });

        mounted.push({ container, root });

        expect(container.textContent || '').toContain('Tema');
        expect(container.textContent || '').toContain('Sistema');

        const darkButton = Array.from(container.querySelectorAll('[data-testid="settings-ui-theme-row"] [data-slot="toggle-group-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Oscuro'
        ) as HTMLButtonElement | undefined;
        expect(darkButton).toBeDefined();

        await act(async () => {
            darkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onPersistUiSettings).toHaveBeenCalledWith({
            ...getDefaultUiSettings(),
            theme: 'dark',
        });
    });

    test('renders agora layout control and persists selected layout', async () => {
        const onPersistUiSettings = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <SettingsUiPage
                    uiSettings={getDefaultUiSettings()}
                    onPersistUiSettings={onPersistUiSettings}
                />
            );
        });

        mounted.push({ container, root });

        const toggleGroup = container.querySelector('[data-testid="settings-ui-agora-layout"] [data-slot="toggle-group"]') as HTMLDivElement | null;
        expect(toggleGroup).not.toBeNull();
        expect(toggleGroup?.textContent).toContain('Lista');
        expect(toggleGroup?.textContent).toContain('Masonry');

        const masonryButton = Array.from(container.querySelectorAll('[data-testid="settings-ui-agora-layout"] [data-slot="toggle-group-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Masonry'
        ) as HTMLButtonElement | undefined;
        expect(masonryButton).toBeDefined();

        await act(async () => {
            masonryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onPersistUiSettings).toHaveBeenCalledWith({
            ...getDefaultUiSettings(),
            agoraFeedLayout: 'masonry',
        });
    });

    test('renders map preset selector and emits selected preset', async () => {
        const onMapColourSchemeChange = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <SettingsUiPage
                    uiSettings={getDefaultUiSettings()}
                    onPersistUiSettings={vi.fn()}
                    mapColourScheme="Nostr City Light"
                    mapColourSchemeNames={['Nostr City Light', 'Nostr City Dark']}
                    onMapColourSchemeChange={onMapColourSchemeChange}
                />
            );
        });

        mounted.push({ container, root });

        const row = container.querySelector('[data-testid="settings-ui-map-preset-row"]');
        expect(row).not.toBeNull();
        expect(row?.textContent || '').toContain('Preset del mapa');
        expect(row?.textContent || '').toContain('Nostr City Light');

        const trigger = row?.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement | null;
        expect(trigger).toBeDefined();

        await act(async () => {
            trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const darkOption = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Nostr City Dark'
        ) as HTMLElement | undefined;
        expect(darkOption).toBeDefined();

        await act(async () => {
            darkOption?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            darkOption?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        expect(onMapColourSchemeChange).toHaveBeenCalledWith('Nostr City Dark');
    });

    test('renders language selector row for choosing spanish or english', async () => {
        const onPersistUiSettings = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <SettingsUiPage
                    uiSettings={{
                        ...getDefaultUiSettings(),
                        language: 'es',
                    } as Parameters<typeof SettingsUiPage>[0]['uiSettings']}
                    onPersistUiSettings={onPersistUiSettings}
                />
            );
        });

        mounted.push({ container, root });

        expect(container.querySelector('[data-testid="settings-ui-language-row"]')).not.toBeNull();
        expect(container.textContent || '').toContain('Idioma');
        expect(container.textContent || '').toContain('Español');
    });

    test('does not render horizontal separators between ui setting sections', async () => {
        const rendered = await renderPage();
        mounted.push(rendered);

        expect(rendered.container.querySelectorAll('[data-slot="separator"]')).toHaveLength(0);
        expect(rendered.container.querySelectorAll('.nostr-settings-section').length).toBeGreaterThan(1);
    });
});
