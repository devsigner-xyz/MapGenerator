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
});
