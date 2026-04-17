import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { LoginMethodSelector } from './LoginMethodSelector';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface RenderSelectorInput {
    disabled?: boolean;
    initialMethod?: 'npub' | 'nip07' | 'nip46';
}

async function renderSelector(input: RenderSelectorInput = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onStartSession = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
        root.render(
            <LoginMethodSelector
                disabled={input.disabled ?? false}
                onStartSession={onStartSession}
                initialMethod={input.initialMethod}
            />
        );
    });

    (container as any).__handlers = {
        onStartSession,
    };

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }

    const htmlElementPrototype = HTMLElement.prototype as HTMLElement & {
        hasPointerCapture?: (pointerId: number) => boolean;
        setPointerCapture?: (pointerId: number) => void;
        releasePointerCapture?: (pointerId: number) => void;
    };

    if (!htmlElementPrototype.hasPointerCapture) {
        htmlElementPrototype.hasPointerCapture = () => false;
    }

    if (!htmlElementPrototype.setPointerCapture) {
        htmlElementPrototype.setPointerCapture = () => {};
    }

    if (!htmlElementPrototype.releasePointerCapture) {
        htmlElementPrototype.releasePointerCapture = () => {};
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

describe('LoginMethodSelector', () => {
    test('renders shadcn select and npub input by default', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        const npubInput = rendered.container.querySelector('input[name="npub"]');
        const methodSelectTrigger = rendered.container.querySelector('[data-slot="select-trigger"]');

        expect(content).not.toContain('Accede o explora');
        expect(content).toContain('npub (solo lectura)');
        expect(content).toContain('Metodo de acceso');
        expect(methodSelectTrigger).not.toBeNull();
        expect(npubInput).not.toBeNull();
    });

    test('does not show nsec in login method options', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const methodSelectTrigger = rendered.container.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement;
        expect(methodSelectTrigger).toBeDefined();

        await act(async () => {
            methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const options = Array.from(document.body.querySelectorAll('[data-slot="select-item"]'));
        expect(options.some((option) => (option.textContent || '').trim() === 'nsec')).toBe(false);
        expect(options.some((option) => (option.textContent || '').trim() === 'Extension (NIP-07)')).toBe(true);
        expect(options.some((option) => (option.textContent || '').trim() === 'Bunker (NIP-46)')).toBe(true);
    });

    test('submits npub login through startSession handler', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const handlers = (rendered.container as any).__handlers;
        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(handlers.onStartSession).toHaveBeenCalledWith('npub', {
            credential: 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw',
        });
    });

    test('keeps selector focused on access methods only', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).not.toContain('Sesion activa');
        expect(content).not.toContain('Bloquear sesion');
    });

    test('shows loading state on npub submit while parent loading is active', async () => {
        const rendered = await renderSelector({ disabled: true });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submitButton).toBeDefined();
        expect(submitButton.textContent || '').toContain('Cargando');
        const spinner = submitButton.querySelector('[aria-label="Loading"]');
        expect(spinner).toBeDefined();
    });

    test('submits bunker uri through nip46 method', async () => {
        const rendered = await renderSelector({ initialMethod: 'nip46' });
        mounted.push(rendered);

        const handlers = (rendered.container as any).__handlers;
        const bunkerInput = rendered.container.querySelector('input[name="bunker-uri"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(bunkerInput, `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`);
            bunkerInput.dispatchEvent(new Event('input', { bubbles: true }));
            bunkerInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(handlers.onStartSession).toHaveBeenCalledWith('nip46', {
            bunkerUri: `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`,
        });
    });
});
