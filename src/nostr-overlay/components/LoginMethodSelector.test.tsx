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
    loadingText?: string;
}

async function renderSelector(input: RenderSelectorInput = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onStartSession = vi.fn().mockResolvedValue(undefined);
    const selectorProps = {
        disabled: input.disabled ?? false,
        onStartSession,
        ...(input.loadingText === undefined ? {} : { loadingText: input.loadingText }),
        ...(input.initialMethod === undefined ? {} : { initialMethod: input.initialMethod }),
    };

    await act(async () => {
        root.render(
            <LoginMethodSelector {...selectorProps} />
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
        expect(content).toContain('Public key');
        expect(content).toContain('Acceder');
        expect(methodSelectTrigger).not.toBeNull();
        expect(npubInput).not.toBeNull();
        expect(methodSelectTrigger?.classList.contains('w-full')).toBe(true);
    });

    test('uses auth-scoped foreground label styling for the default login labels', async () => {
        const rendered = await renderSelector({ initialMethod: 'npub' });
        mounted.push(rendered);

        const labels = Array.from(rendered.container.querySelectorAll('label'));
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.every((label) => label.classList.contains('nostr-auth-label'))).toBe(true);
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
        expect(content).not.toContain('Crear cuenta');
        expect(content).not.toContain('Crear cuenta en esta app');
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

    test('falls back to generic loading copy when loading text is blank', async () => {
        const rendered = await renderSelector({ disabled: true, loadingText: '   ' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submitButton).toBeDefined();
        expect(submitButton.textContent || '').toContain('Cargando...');
    });

    test('shows specific progress copy on npub submit when loading text is provided', async () => {
        const rendered = await renderSelector({ disabled: true, loadingText: 'Construyendo mapa...' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submitButton).toBeDefined();
        expect(submitButton.textContent || '').toContain('Construyendo mapa...');
        expect(submitButton.textContent || '').not.toContain('Cargando...');
    });

    test('shows specific progress copy on nip07 submit when loading text is provided', async () => {
        const rendered = await renderSelector({ disabled: true, initialMethod: 'nip07', loadingText: 'Conectando a relay...' });
        mounted.push(rendered);

        const submitButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectando a relay...')
        ) as HTMLButtonElement | undefined;
        expect(submitButton).toBeDefined();
        expect(submitButton?.textContent || '').not.toContain('Cargando...');
    });

    test('shows specific progress copy on nip46 submit when loading text is provided', async () => {
        const rendered = await renderSelector({ disabled: true, initialMethod: 'nip46', loadingText: 'Conectando a relay...' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submitButton).toBeDefined();
        expect(submitButton.textContent || '').toContain('Conectando a relay...');
        expect(submitButton.textContent || '').not.toContain('Conectar bunker');
    });

    test('layers shared utility spacing onto the npub primary action button', async () => {
        const rendered = await renderSelector({ initialMethod: 'npub' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('button[type="submit"]') as HTMLButtonElement | null;

        expect(submitButton?.classList.contains('nostr-login-method-actions')).toBe(true);
        expect(submitButton?.classList.contains('mt-2')).toBe(true);
        expect(submitButton?.classList.contains('w-full')).toBe(true);
    });

    test('layers shared utility spacing onto the nip07 primary action button', async () => {
        const rendered = await renderSelector({ initialMethod: 'nip07' });
        mounted.push(rendered);

        const primaryButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Continuar con extension')
        ) as HTMLButtonElement | undefined;

        expect(primaryButton?.classList.contains('nostr-login-method-actions')).toBe(true);
        expect(primaryButton?.classList.contains('mt-2')).toBe(true);
        expect(primaryButton?.classList.contains('w-full')).toBe(true);
        expect(rendered.container.querySelector('.nostr-label')?.classList.contains('nostr-auth-label')).toBe(true);
    });

    test('layers shared utility spacing onto the nip46 primary action button', async () => {
        const rendered = await renderSelector({ initialMethod: 'nip46' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('button[type="submit"]') as HTMLButtonElement | null;

        expect(submitButton?.classList.contains('nostr-login-method-actions')).toBe(true);
        expect(submitButton?.classList.contains('mt-2')).toBe(true);
        expect(submitButton?.classList.contains('w-full')).toBe(true);
        const labels = Array.from(rendered.container.querySelectorAll('label'));
        expect(labels.every((label) => label.classList.contains('nostr-auth-label'))).toBe(true);
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
