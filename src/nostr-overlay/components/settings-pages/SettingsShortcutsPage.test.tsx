import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { SettingsShortcutsPage } from './SettingsShortcutsPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderPage(): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<SettingsShortcutsPage />);
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

describe('SettingsShortcutsPage', () => {
    test('uses shared settings layout classes', async () => {
        const rendered = await renderPage();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="settings-page-body"]')?.className).toContain('nostr-settings-body');
        expect(rendered.container.querySelector('.nostr-settings-form')).not.toBeNull();
        expect(rendered.container.querySelectorAll('.nostr-settings-section')).toHaveLength(1);
    });
});
