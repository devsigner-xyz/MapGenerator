import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { NotificationsPage } from './NotificationsPage';
import type { SocialNotificationItem } from '../../nostr/social-notifications-service';

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

function buildItem(overrides: Partial<SocialNotificationItem> = {}): SocialNotificationItem {
    return {
        id: 'notif-1',
        kind: 7,
        actorPubkey: 'a'.repeat(64),
        createdAt: 100,
        content: '+',
        targetEventId: 'b'.repeat(64),
        targetPubkey: 'c'.repeat(64),
        rawEvent: {
            id: 'notif-1',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 100,
            tags: [['p', 'c'.repeat(64)], ['e', 'b'.repeat(64)]],
            content: '+',
        },
        ...overrides,
    };
}

describe('NotificationsPage', () => {
    test('shows unread indicator when hasUnread is true', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread
                notifications={[buildItem()]}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-notifications-unread-dot')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="overlay-page-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
    });

    test('hides unread indicator when hasUnread is false', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                notifications={[buildItem()]}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-notifications-unread-dot')).toBeNull();
    });

    test('renders empty state when there are no pending notifications', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                notifications={[]}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Sin notificaciones');
        expect(rendered.container.textContent || '').toContain('No tienes notificaciones pendientes.');
        expect(rendered.container.querySelector('.nostr-notifications-empty-state')).not.toBeNull();
    });

    test('renders notifications list items', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                notifications={[
                    buildItem({ id: 'notif-1', kind: 1, content: 'hola' }),
                    buildItem({ id: 'notif-2', kind: 9735, content: 'zap' }),
                ]}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Mencion');
        expect(rendered.container.textContent || '').toContain('Zap');
        expect(rendered.container.querySelectorAll('.nostr-notifications-list [data-slot="item"]')).toHaveLength(2);
    });

    test('keeps the notifications body shrinkable inside the routed panel', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                notifications={[buildItem()]}
            />
        );
        mounted.push(rendered);

        const pageBody = rendered.container.querySelector('.nostr-notifications-page > section') as HTMLElement | null;
        expect(pageBody).not.toBeNull();
        expect(pageBody?.className).toContain('min-h-0');
    });

    test('does not render a close action in the page header', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread
                notifications={[buildItem()]}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('button[aria-label="Cerrar notificaciones"]')).toBeNull();
    });

    test('renders english notifications copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <NotificationsPage
                hasUnread
                notifications={[]}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Notifications');
        expect(text).toContain('Recent activity from people and content you follow.');
        expect(text).toContain('No notifications');
        expect(text).toContain('You have no pending notifications.');
    });
});
