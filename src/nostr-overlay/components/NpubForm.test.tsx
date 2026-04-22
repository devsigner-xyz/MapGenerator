import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { NpubForm } from './NpubForm';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderForm(input: { disabled?: boolean } = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
        root.render(<NpubForm disabled={input.disabled ?? false} onSubmit={onSubmit} />);
    });

    (container as HTMLDivElement & { __handlers?: { onSubmit: ReturnType<typeof vi.fn> } }).__handlers = {
        onSubmit,
    };

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('NpubForm', () => {
    test('renders stable test ids for the npub form flow', async () => {
        const rendered = await renderForm();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="npub-form"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="npub-submit"]')).not.toBeNull();
        expect(rendered.container.querySelector('input[name="npub"]')).not.toBeNull();
    });

    test('submits the trimmed npub value', async () => {
        const rendered = await renderForm();
        mounted.push(rendered);
        const handlers = (rendered.container as HTMLDivElement & { __handlers?: { onSubmit: ReturnType<typeof vi.fn> } }).__handlers;
        const input = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('[data-testid="npub-form"]') as HTMLFormElement;

        expect(input).toBeDefined();
        expect(form).toBeDefined();

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(input, ' npub1testvalue ');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(handlers?.onSubmit).toHaveBeenCalledWith('npub1testvalue');
    });

    test('renders english form copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderForm();
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Public key');
        expect(rendered.container.textContent || '').toContain('Sign in');
    });
});
