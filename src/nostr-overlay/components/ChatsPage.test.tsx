import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { ChatsPage, type ChatConversationSummary, type ChatDetailMessage } from './ChatsPage';

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

function buildConversation(overrides: Partial<ChatConversationSummary> = {}): ChatConversationSummary {
    return {
        id: 'peer-1',
        peerPubkey: 'a'.repeat(64),
        title: 'Alice',
        lastMessagePreview: 'Hola',
        lastMessageAt: 100,
        hasUnread: false,
        ...overrides,
    };
}

function buildMessage(overrides: Partial<ChatDetailMessage> = {}): ChatDetailMessage {
    return {
        id: 'm-1',
        direction: 'incoming',
        plaintext: 'hola',
        createdAt: 100,
        deliveryState: 'sent',
        ...overrides,
    };
}

describe('ChatsPage', () => {
    test('query surface exposes data-chat-source marker', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const querySurface = rendered.container.querySelector('[data-chat-source="query"]');
        expect(querySurface).not.toBeNull();
    });

    test('renders shared unread indicator and empty state', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal
                conversations={[]}
                messages={[]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="overlay-page-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-unread-dot')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Sin conversaciones');
        expect(rendered.container.querySelector('.nostr-chat-empty-state')).not.toBeNull();
    });

    test('shows full-page shadcn empty loading state while bootstrapping conversations', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                isLoadingConversations
                conversations={[]}
                messages={[]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Cargando conversaciones');

        const loadingEmpty = rendered.container.querySelector('.nostr-chats-loading-empty[data-slot="empty"]') as HTMLElement;
        expect(loadingEmpty).toBeDefined();

        const spinner = loadingEmpty.querySelector('[aria-label="Loading"]');
        expect(spinner).not.toBeNull();

        expect(rendered.container.querySelector('.nostr-chat-layout')).toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-list-panel')).toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-detail-panel')).toBeNull();
    });

    test('supports list/detail navigation', async () => {
        const onOpenConversation = vi.fn();

        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId={null}
                onOpenConversation={onOpenConversation}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const conversationButton = rendered.container.querySelector('button[data-chat-conversation="peer-1"]') as HTMLButtonElement;
        expect(conversationButton).toBeDefined();

        await act(async () => {
            conversationButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenConversation).toHaveBeenCalledWith('peer-1');
    });

    test('renders avatar and latest message preview in list rows without contextual menu', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[
                    buildConversation({
                        profile: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Alice',
                            picture: 'https://example.com/alice.png',
                        },
                    }),
                ]}
                messages={[buildMessage()]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const rowButton = rendered.container.querySelector('button[data-chat-conversation="peer-1"]') as HTMLButtonElement;
        expect(rowButton).not.toBeNull();

        const avatarFallback = rowButton.querySelector('[data-slot="avatar-fallback"]') as HTMLElement;
        expect(avatarFallback).not.toBeNull();
        expect(avatarFallback.textContent || '').toContain('AL');
        expect(rendered.container.textContent || '').toContain('Hola');
        expect(rendered.container.querySelector('button[aria-label="Abrir acciones para Alice"]')).toBeNull();
    });

    test('shows undecryptable placeholder in detail view', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage({ isUndecryptable: true, plaintext: '' })]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('No se pudo desencriptar este mensaje');
    });

    test('renders routed page container for wide chat layout', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const pageContent = rendered.container.querySelector('.nostr-chats-page');
        const listPanel = rendered.container.querySelector('.nostr-chat-list-panel[data-slot="card"]');
        const detailPanel = rendered.container.querySelector('.nostr-chat-detail-panel[data-slot="card"]');
        expect(pageContent).not.toBeNull();
        expect(listPanel).not.toBeNull();
        expect(detailPanel).not.toBeNull();
        expect(listPanel?.getAttribute('data-variant')).toBe('elevated');
        expect(detailPanel?.getAttribute('data-variant')).toBe('elevated');
        expect(rendered.container.querySelector('[data-slot="dialog-content"]')).toBeNull();
    });

    test('renders outgoing delivery states in conversation detail', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[
                    buildMessage({ id: 'm-pending', direction: 'outgoing', deliveryState: 'pending', plaintext: 'uno' }),
                    buildMessage({ id: 'm-sent', direction: 'outgoing', deliveryState: 'sent', plaintext: 'dos' }),
                    buildMessage({ id: 'm-failed', direction: 'outgoing', deliveryState: 'failed', plaintext: 'tres' }),
                ]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Enviando...');
        expect(rendered.container.textContent || '').toContain('Enviado');
        expect(rendered.container.textContent || '').toContain('Error de entrega');
    });
});
