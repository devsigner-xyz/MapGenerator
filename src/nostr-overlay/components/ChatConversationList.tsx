import type { ChatConversationSummary } from './ChatDialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

interface ChatConversationListProps {
    conversations: ChatConversationSummary[];
    loading: boolean;
    activeConversationId: string | null;
    onOpenConversation: (conversationId: string) => void;
}

export function ChatConversationList({ conversations, loading, activeConversationId, onOpenConversation }: ChatConversationListProps) {
    if (loading && conversations.length === 0) {
        return (
            <div className="nostr-chat-loading" role="status" aria-live="polite">
                <Spinner />
                <span>Cargando conversaciones...</span>
            </div>
        );
    }

    if (conversations.length === 0) {
        return (
            <Empty className="nostr-chat-empty">
                <EmptyHeader>
                    <EmptyTitle>Sin conversaciones</EmptyTitle>
                    <EmptyDescription>No hay conversaciones todavía.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <ul className="nostr-chat-conversation-list">
            {conversations.map((conversation) => {
                const isActive = activeConversationId === conversation.id;
                return (
                    <li key={conversation.id}>
                        <button
                            type="button"
                            data-chat-conversation={conversation.id}
                            className={`nostr-chat-conversation-item${isActive ? ' is-active' : ''}`}
                            onClick={() => onOpenConversation(conversation.id)}
                        >
                            <span className="nostr-chat-conversation-title-row">
                                <span className="nostr-chat-conversation-title">{conversation.title}</span>
                                {conversation.hasUnread ? <span className="nostr-chat-conversation-unread" aria-hidden="true" /> : null}
                            </span>
                            <span className="nostr-chat-conversation-preview">{conversation.lastMessagePreview || 'Sin mensajes'}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
