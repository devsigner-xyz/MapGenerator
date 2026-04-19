import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { LoginGateScreen } from './LoginGateScreen';
import type { AuthSessionState } from '../../nostr/auth/session';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderScreen(options: {
    disabled?: boolean;
    authSession?: AuthSessionState;
    savedLocalAccount?: { pubkey: string; mode: 'device' | 'passphrase' };
    mapLoaderText?: string;
    restoringSession?: boolean;
} = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <LoginGateScreen
                authSession={options.authSession}
                savedLocalAccount={options.savedLocalAccount}
                disabled={options.disabled ?? false}
                mapLoaderText={options.mapLoaderText}
                restoringSession={options.restoringSession ?? false}
                onStartSession={vi.fn()}
            />
        );
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
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

describe('LoginGateScreen', () => {
    test('uses the elevated shared card surface without the legacy content padding hook', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const shellCard = rendered.container.querySelector('.nostr-login-screen-card');
        const shellContent = rendered.container.querySelector('[data-slot="card-content"]');

        expect(shellCard?.getAttribute('data-variant')).toBe('elevated');
        expect(shellCard?.className).toContain('py-0');
        expect(shellCard?.className).toContain('gap-0');
        expect(shellContent?.classList.contains('nostr-login-screen-content')).toBe(false);
    });

    test('keeps the main login view without a footer back action', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        expect(footer).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Volver al login');
    });

    test('shows a visible create account entry point', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Crear cuenta');
    });

    test('groups login selector and create account entry point in the main login container', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const selectorSection = rendered.container.querySelector('section[aria-label="Selector de login de Nostr"]');
        const actionGroup = rendered.container.querySelector('[data-testid="login-gate-actions"]');

        expect(selectorSection).not.toBeNull();
        expect(actionGroup).not.toBeNull();
        expect(selectorSection?.parentElement).toBe(actionGroup);
    });

    test('disables create account entry point when login gate is disabled', async () => {
        const rendered = await renderScreen({ disabled: true });
        mounted.push(rendered);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;

        expect(createAccountButton).toBeDefined();
        expect(createAccountButton?.disabled).toBe(true);
    });

    test('moves the create-account-selector back action into the shell footer without a nested selector card', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;
        expect(createAccountButton).toBeDefined();

        await act(async () => {
            createAccountButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        const footerButtons = Array.from(footer?.querySelectorAll('button') ?? []);

        expect(footer).not.toBeNull();
        expect(footerButtons).toHaveLength(1);
        expect(footerButtons[0]?.textContent || '').toContain('Volver al login');
        expect(rendered.container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    });

    test('returns from the create-account-selector footer to the main login view', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;
        expect(createAccountButton).toBeDefined();

        await act(async () => {
            createAccountButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Volver al login')
        ) as HTMLButtonElement | undefined;
        expect(backButton).toBeDefined();

        await act(async () => {
            backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        expect(rendered.container.querySelector('[data-testid="auth-flow-footer"]')).toBeNull();
        expect(rendered.container.textContent || '').toContain('Metodo de acceso');
    });

    test('shows unlock form for locked local sessions and submits passphrase unlock', async () => {
        const lockedSession: AuthSessionState = {
            method: 'local',
            pubkey: 'f'.repeat(64),
            readonly: false,
            locked: true,
            createdAt: 1,
            capabilities: {
                canSign: true,
                canEncrypt: true,
                encryptionSchemes: ['nip44'],
            },
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const onStartSession = vi.fn().mockResolvedValue(undefined);

        await act(async () => {
            root.render(
                <LoginGateScreen
                    authSession={lockedSession}
                    onStartSession={onStartSession}
                />
            );
        });

        mounted.push({ container, root });

        const passphraseInput = container.querySelector('input[name="unlock-passphrase"]') as HTMLInputElement;
        expect(passphraseInput).toBeDefined();
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(passphraseInput, 'local-passphrase');
            passphraseInput.dispatchEvent(new Event('input', { bubbles: true }));
            passphraseInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const form = container.querySelector('form[data-testid="unlock-local-account-form"]');
        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(onStartSession).toHaveBeenCalledWith('local', {
            pubkey: lockedSession.pubkey,
            passphrase: 'local-passphrase',
        });
    });

    test('shows quick continue action for saved device-protected local accounts', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const onStartSession = vi.fn().mockResolvedValue(undefined);

        await act(async () => {
            root.render(
                <LoginGateScreen
                    savedLocalAccount={{ pubkey: 'f'.repeat(64), mode: 'device' }}
                    onStartSession={onStartSession}
                />
            );
        });

        mounted.push({ container, root });

        const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Continuar con cuenta local guardada')
        ) as HTMLButtonElement | undefined;
        expect(continueButton).toBeDefined();

        await act(async () => {
            continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onStartSession).toHaveBeenCalledWith('local', {
            pubkey: 'f'.repeat(64),
        });
    });

    test('keeps saved local account layout outside the normal main login grouping', async () => {
        const rendered = await renderScreen({
            savedLocalAccount: { pubkey: 'f'.repeat(64), mode: 'device' },
        });
        mounted.push(rendered);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        );

        expect(createAccountButton?.closest('[data-testid="login-gate-actions"]')).toBeNull();
    });

    test('shows passphrase re-entry form for saved passphrase-protected local accounts', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const onStartSession = vi.fn().mockResolvedValue(undefined);

        await act(async () => {
            root.render(
                <LoginGateScreen
                    savedLocalAccount={{ pubkey: 'f'.repeat(64), mode: 'passphrase' }}
                    onStartSession={onStartSession}
                />
            );
        });

        mounted.push({ container, root });

        const passphraseInput = container.querySelector('input[name="saved-local-passphrase"]') as HTMLInputElement;
        expect(passphraseInput).toBeDefined();
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(passphraseInput, 'local-passphrase');
            passphraseInput.dispatchEvent(new Event('input', { bubbles: true }));
            passphraseInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const form = passphraseInput.closest('form');
        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(onStartSession).toHaveBeenCalledWith('local', {
            pubkey: 'f'.repeat(64),
            passphrase: 'local-passphrase',
        });
    });

    test('does not render a logout action inside the login gate', async () => {
        const activeSession: AuthSessionState = {
            method: 'npub',
            pubkey: 'f'.repeat(64),
            readonly: true,
            locked: false,
            createdAt: 1,
            capabilities: {
                canSign: false,
                canEncrypt: false,
                encryptionSchemes: [],
            },
        };
        const rendered = await renderScreen({ authSession: activeSession });
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Cerrar sesion');
    });

    test('does not render map loader text above the login form', async () => {
        const rendered = await renderScreen({ mapLoaderText: 'Construyendo mapa...' });
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Construyendo mapa...');
    });

    test('shows only the restoration state while restoring a session', async () => {
        const rendered = await renderScreen({ restoringSession: true });
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(rendered.container.querySelector('[data-slot="empty"]')).not.toBeNull();
        expect(content).toContain('Recuperando sesión');
        expect(content).toContain('Preparando acceso...');
        expect(content).not.toContain('Restaurando sesion');
        expect(content).not.toContain('Metodo de acceso');
        expect(rendered.container.querySelector('input[name="npub"]')).toBeNull();
        expect(rendered.container.querySelector('[data-slot="empty-icon"] [aria-label="Loading"]')).not.toBeNull();
    });

    test('shows dynamic restoration subtitle from map loader text', async () => {
        const rendered = await renderScreen({ restoringSession: true, mapLoaderText: 'Construyendo mapa...' });
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Recuperando sesión');
        expect(content).toContain('Construyendo mapa...');
        expect(content).not.toContain('Preparando acceso...');
    });
});
