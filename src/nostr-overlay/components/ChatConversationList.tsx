import type { ChatConversationSummary } from './ChatsPage';
import { Nip05Identifier } from './Nip05Identifier';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';

interface ChatConversationListProps {
    conversations: ChatConversationSummary[];
    loading: boolean;
    activeConversationId: string | null;
    onOpenConversation: (conversationId: string) => void;
}

function conversationInitials(title: string, peerPubkey: string): string {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
        return peerPubkey.slice(0, 2).toUpperCase();
    }

    const words = normalizedTitle.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
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
                        <Item
                            variant={isActive ? 'outline' : 'default'}
                            size="sm"
                            data-active={isActive ? 'true' : 'false'}
                            className={`nostr-chat-conversation-item${isActive ? ' is-active' : ''}`}
                        >
                            <button
                                type="button"
                                data-chat-conversation={conversation.id}
                                className="nostr-chat-conversation-button"
                                onClick={() => onOpenConversation(conversation.id)}
                            >
                                <ItemMedia>
                                    <Avatar className="size-8">
                                        {conversation.profile?.picture ? (
                                            <AvatarImage src={conversation.profile.picture} alt={conversation.title} />
                                        ) : null}
                                        <AvatarFallback>{conversationInitials(conversation.title, conversation.peerPubkey)}</AvatarFallback>
                                    </Avatar>
                                </ItemMedia>

                                <ItemContent className="min-w-0">
                                    <ItemTitle className="nostr-chat-conversation-title-row">
                                        <span className="nostr-chat-conversation-title-content">
                                            <span className="nostr-chat-conversation-title">{conversation.title}</span>
                                            <Nip05Identifier profile={conversation.profile} verification={conversation.verification} mode="icon" />
                                        </span>
                                        {conversation.hasUnread ? <span className="nostr-chat-conversation-unread" aria-hidden="true" /> : null}
                                    </ItemTitle>
                                    <ItemDescription className="nostr-chat-conversation-preview">
                                        {conversation.lastMessagePreview || 'Sin mensajes'}
                                    </ItemDescription>
                                </ItemContent>
                            </button>
                        </Item>
                    </li>
                );
            })}
        </ul>
    );
}
