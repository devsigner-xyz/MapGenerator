import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
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
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-notifications-unread-dot')).not.toBeNull();
    });

    test('hides unread indicator when hasUnread is false', async () => {
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread={false}
                notifications={[buildItem()]}
                onClose={() => {}}
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
                onClose={() => {}}
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
                onClose={() => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Mencion');
        expect(rendered.container.textContent || '').toContain('Zap');
    });

    test('calls onClose when close button is clicked', async () => {
        const onClose = vi.fn();
        const rendered = await renderElement(
            <NotificationsPage
                hasUnread
                notifications={[buildItem()]}
                onClose={onClose}
            />
        );
        mounted.push(rendered);

        const closeButton = rendered.container.querySelector('button[aria-label="Cerrar notificaciones"]') as HTMLButtonElement;
        expect(closeButton).toBeDefined();

        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
