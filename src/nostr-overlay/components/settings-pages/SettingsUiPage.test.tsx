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
        expect(rendered.container.querySelector('[data-testid="settings-ui-occupied-zoom-row"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-ui-street-labels-row"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-ui-traffic-speed-row"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Interfaz');
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
});
