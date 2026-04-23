import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { OverlaySidebar } from './OverlaySidebar';
import type { AuthSessionState } from '../../nostr/auth/session';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderSidebar(pathname = '/'): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const authSession: AuthSessionState = {
        method: 'nip07',
        pubkey: 'f'.repeat(64),
        readonly: true,
        locked: false,
        createdAt: 1,
        capabilities: {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip44'],
        },
    };

    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[pathname]}>
                <OverlaySidebar
                    open
                    onOpenChange={vi.fn()}
                    authSession={authSession}
                    ownerPubkey={'f'.repeat(64)}
                    ownerProfile={{ pubkey: 'f'.repeat(64), displayName: 'Nostr City', picture: 'https://example.com/avatar.png' }}
                    canWrite
                    canAccessDirectMessages
                    canAccessSocialNotifications
                    canAccessFollowingFeed
                    chatHasUnread
                    notificationsHasUnread
                    followingFeedHasUnread
                    onOpenMap={vi.fn()}
                    onOpenCityStats={vi.fn()}
                    onOpenChat={vi.fn()}
                    onOpenRelays={vi.fn()}
                    onOpenNotifications={vi.fn()}
                    onOpenFollowingFeed={vi.fn()}
                    onOpenGlobalSearch={vi.fn()}
                    onOpenWallet={vi.fn()}
                    onOpenPublish={vi.fn()}
                    onOpenSettings={vi.fn()}
                    isUiSettingsOpen={false}
                    onLogout={vi.fn()}
                    onCopyOwnerNpub={vi.fn()}
                    onLocateOwner={vi.fn()}
                    onViewOwnerDetails={vi.fn()}
                    missionsDiscoveredCount={2}
                    missionsTotal={5}
                    relaysConnectedCount={3}
                    relaysTotal={5}
                    onOpenMissions={vi.fn()}
                >
                    <div>Social content</div>
                </OverlaySidebar>
            </MemoryRouter>
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
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('OverlaySidebar', () => {
    test('adds shared utility toolbar density on top of the legacy toolbar hook', async () => {
        const rendered = await renderSidebar('/');
        mounted.push(rendered);

        const mapButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Mapa'));
        const toolbar = mapButton?.closest('[data-slot="sidebar-menu"]');

        expect(toolbar).not.toBeNull();
        expect(toolbar?.classList.contains('nostr-panel-toolbar')).toBe(true);
        expect(toolbar?.classList.contains('gap-1.5')).toBe(true);
    });

    test('renders unread indicators through the shared unread slot marker', async () => {
        const rendered = await renderSidebar('/');
        mounted.push(rendered);

        const agoraButton = rendered.container.querySelector('button[aria-label="Abrir Agora"]');
        const chatButton = rendered.container.querySelector('button[aria-label="Abrir chats"]');
        const notificationsButton = rendered.container.querySelector('button[aria-label="Abrir notificaciones"]');

        expect(agoraButton?.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
        expect(chatButton?.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
        expect(notificationsButton?.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
        expect(agoraButton?.getAttribute('aria-description')).toContain('sin leer');
        expect(chatButton?.getAttribute('aria-description')).toContain('sin leer');
        expect(notificationsButton?.getAttribute('aria-description')).toContain('sin leer');
    });

    test('keeps readonly state inside the shared badge primitive in the user menu', async () => {
        const rendered = await renderSidebar('/');
        mounted.push(rendered);

        const readonlyBadge = Array.from(rendered.container.querySelectorAll('[data-slot="badge"]')).find((badge) =>
            (badge.textContent || '').includes('Solo lectura')
        );

        expect(readonlyBadge).not.toBeNull();
    });

    test('renders wallet top-level entry above settings', async () => {
        const rendered = await renderSidebar('/wallet');
        mounted.push(rendered);

        const panelButtons = Array.from(rendered.container.querySelectorAll('.nostr-panel-toolbar > [data-slot="sidebar-menu-item"] button'));
        const labels = panelButtons.map((button) => (button.textContent || '').trim()).filter(Boolean);
        const walletIndex = labels.indexOf('Wallet');
        const settingsIndex = labels.indexOf('Ajustes');

        expect(walletIndex).toBeGreaterThanOrEqual(0);
        expect(settingsIndex).toBeGreaterThan(walletIndex);
    });

    test('renders english top-level labels when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderSidebar('/agora');
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Agora');
        expect(text).toContain('Chats');
        expect(text).toContain('Relays');
        expect(text).toContain('Social platform');
    });
});
