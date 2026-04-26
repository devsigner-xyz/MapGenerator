import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { getDefaultUiSettings } from '../../nostr/ui-settings';
import { UiSettingsDialog } from './UiSettingsDialog';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
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

describe('UiSettingsDialog', () => {
    test('uses a wider constrained scrollable dialog surface', async () => {
        const rendered = await renderElement(
            <UiSettingsDialog
                open
                uiSettings={getDefaultUiSettings()}
                onPersistUiSettings={vi.fn()}
                onOpenChange={vi.fn()}
            />
        );
        mounted.push(rendered);

        const content = document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement | null;
        expect(content).not.toBeNull();
        expect(content?.className).toContain('nostr-settings-dialog');
        expect(content?.className).toContain('nostr-settings-dialog-ui');
        expect(content?.className).not.toContain('max-w-xl');
    });
});
