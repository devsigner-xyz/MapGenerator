import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { ProfileTab } from './ProfileTab';

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
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.localStorage.clear();
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

describe('ProfileTab', () => {
    test('does not render redundant owner identity block in information tab', async () => {
        const rendered = await renderElement(
            <ProfileTab
                ownerPubkey={'f'.repeat(64)}
                ownerProfile={{
                    pubkey: 'f'.repeat(64),
                    displayName: 'Owner',
                    picture: 'https://example.com/avatar.png',
                }}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-profile-header-main')).toBeNull();
        expect(rendered.container.querySelector('.nostr-profile-avatar')).toBeNull();
        expect(rendered.container.querySelector('.nostr-profile-name')).toBeNull();
    });

    test('does not render auth hint copy when owner pubkey is missing', async () => {
        const rendered = await renderElement(
            <ProfileTab />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-auth-hint')).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Modo solo lectura. Inicia sesion con nsec o extension para interactuar con Nostr.');
        expect(rendered.container.textContent || '').not.toContain('Sesion bloqueada. Desbloquea para seguir, publicar y enviar mensajes privados.');
        expect(rendered.container.textContent || '').not.toContain('Sesion lista para seguir, publicar y enviar mensajes privados.');
        expect(rendered.container.textContent || '').not.toContain('Elige un metodo de login para continuar.');
    });

    test('does not render relay stats in about tab', async () => {
        const rendered = await renderElement(
            <ProfileTab
                ownerPubkey={'a'.repeat(64)}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-profile-relay-stats')).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Relays');
        expect(rendered.container.textContent || '').not.toContain('Conectados');
        expect(rendered.container.textContent || '').not.toContain('Sin conexión');
    });

    test('does not render missions block in profile tab', async () => {
        const rendered = await renderElement(
            <ProfileTab
                ownerPubkey={'f'.repeat(64)}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-profile-missions')).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Misiones');
    });
});
