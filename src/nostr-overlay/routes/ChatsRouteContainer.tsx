import type { ComponentProps } from 'react';
import { ChatsPage } from '../components/ChatsPage';

type ChatsPageProps = ComponentProps<typeof ChatsPage>;

export interface ChatsRouteContainerProps {
    hasUnreadGlobal: ChatsPageProps['hasUnreadGlobal'];
    isLoadingConversations: NonNullable<ChatsPageProps['isLoadingConversations']>;
    conversations: ChatsPageProps['conversations'];
    messages: ChatsPageProps['messages'];
    activeConversationId: ChatsPageProps['activeConversationId'];
    composerAutoFocusKey?: ChatsPageProps['composerAutoFocusKey'];
    canSendChatMessages: boolean;
    ownerPubkey?: string;
    canDirectMessages: boolean;
    onOpenConversation: ChatsPageProps['onOpenConversation'];
    sendMessage: (conversationId: string, plaintext: string) => Promise<void> | void;
}

export function ChatsRouteContainer({
    hasUnreadGlobal,
    isLoadingConversations,
    conversations,
    messages,
    activeConversationId,
    composerAutoFocusKey,
    canSendChatMessages,
    ownerPubkey,
    canDirectMessages,
    onOpenConversation,
    sendMessage,
}: ChatsRouteContainerProps) {
    const disabledReason = !ownerPubkey
        ? 'Inicia sesión para enviar mensajes privados.'
        : !canDirectMessages
            ? 'Tu sesión no permite mensajería privada (requiere firma y NIP-44).'
            : undefined;

    return (
        <ChatsPage
            hasUnreadGlobal={hasUnreadGlobal}
            isLoadingConversations={isLoadingConversations}
            conversations={conversations}
            messages={messages}
            activeConversationId={activeConversationId}
            {...(composerAutoFocusKey ? { composerAutoFocusKey } : {})}
            canSend={canSendChatMessages}
            {...(disabledReason ? { disabledReason } : {})}
            onOpenConversation={onOpenConversation}
            onSendMessage={async (plaintext) => {
                if (!activeConversationId || !canSendChatMessages) {
                    return;
                }

                await sendMessage(activeConversationId, plaintext);
            }}
        />
    );
}
