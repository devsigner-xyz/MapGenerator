import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { SettingsZapsPage } from './SettingsZapsPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderPage(): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <SettingsZapsPage
                zapSettings={{ amounts: [21, 128, 256], defaultAmount: 128 }}
                newZapAmountInput="512"
                defaultZapAmountInput="128"
                onNewZapAmountInputChange={vi.fn()}
                onDefaultZapAmountInputChange={vi.fn()}
                onUpdateZapAmount={vi.fn()}
                onRemoveZapAmount={vi.fn()}
                onAddZapAmount={vi.fn()}
            />
        );
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

describe('SettingsZapsPage', () => {
    test('renders a stable add row for zap amounts', async () => {
        const rendered = await renderPage();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="settings-page-body"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-page-body"]')?.className).toContain('nostr-settings-body');
        expect(rendered.container.querySelector('.nostr-settings-form')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-zap-list')?.className).toContain('nostr-settings-section');
        expect(rendered.container.querySelector('[data-testid="settings-zap-add-row"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-zap-add-row"]')?.className).toContain('nostr-settings-row');
        expect(rendered.container.querySelector('input[aria-label="Nueva cantidad de zap"]')).not.toBeNull();
        expect(rendered.container.querySelector('input[aria-label="Cantidad por defecto de zap"]')).not.toBeNull();
        expect(Array.from(rendered.container.querySelectorAll('button')).some((button) => (button.textContent || '').includes('Agregar cantidad'))).toBe(true);
    });
});
