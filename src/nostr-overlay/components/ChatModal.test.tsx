import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { ChatModal, type ChatConversationSummary, type ChatDetailMessage } from './ChatModal';

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

describe('ChatModal', () => {
    test('renders unread red dot and empty state', async () => {
        const rendered = await renderElement(
            <ChatModal
                open
                hasUnreadGlobal
                conversations={[]}
                messages={[]}
                activeConversationId={null}
                onClose={() => {}}
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-chat-unread-dot')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('No hay conversaciones todavía');
    });

    test('supports list/detail navigation', async () => {
        const onOpenConversation = vi.fn();

        const rendered = await renderElement(
            <ChatModal
                open
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId={null}
                onClose={() => {}}
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

    test('shows undecryptable placeholder in detail view', async () => {
        const rendered = await renderElement(
            <ChatModal
                open
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage({ isUndecryptable: true, plaintext: '' })]}
                activeConversationId="peer-1"
                onClose={() => {}}
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('No se pudo desencriptar este mensaje');
    });

    test('opts out of dialog small-screen max-width cap for wide chat layout', async () => {
        const rendered = await renderElement(
            <ChatModal
                open
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId="peer-1"
                onClose={() => {}}
                onOpenConversation={() => {}}
                onBackToList={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const dialogContent = rendered.container.querySelector('[data-slot="dialog-content"]');
        expect(dialogContent).not.toBeNull();
        expect(dialogContent?.className).toContain('sm:max-w-none');
    });
});
