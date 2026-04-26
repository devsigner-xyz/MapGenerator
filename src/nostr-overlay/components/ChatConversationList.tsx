import type { ChatConversationSummary } from './ChatsPage';
import { VerifiedUserAvatar } from './VerifiedUserAvatar';
import { useI18n } from '@/i18n/useI18n';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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
        return (words[0] ?? '').slice(0, 2).toUpperCase();
    }

    return `${words[0]?.[0] || ''}${words[1]?.[0] || ''}`.toUpperCase();
}

export function ChatConversationList({ conversations, loading, activeConversationId, onOpenConversation }: ChatConversationListProps) {
    const { t } = useI18n();
    if (loading && conversations.length === 0) {
        return (
            <div className="nostr-chat-loading" role="status" aria-live="polite">
                <Spinner />
                <span>{t('chats.list.loading')}</span>
            </div>
        );
    }

    if (conversations.length === 0) {
        return (
            <Empty className="nostr-chat-empty">
                <EmptyHeader>
                    <EmptyTitle>{t('chats.list.emptyTitle')}</EmptyTitle>
                    <EmptyDescription>{t('chats.list.emptyDescription')}</EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <ul className="nostr-chat-conversation-list content-start min-w-0">
            {conversations.map((conversation) => {
                const isActive = activeConversationId === conversation.id;
                return (
                    <li key={conversation.id} className="w-full min-w-0">
                        <Item
                            variant="outline"
                            size="sm"
                            data-active={isActive ? 'true' : 'false'}
                            className={cn(
                                'nostr-chat-conversation-item w-full min-w-0 gap-2 border-border/80 bg-card/90 text-card-foreground shadow-none transition-colors',
                                'hover:bg-muted/70 data-[active=true]:bg-muted',
                            )}
                        >
                            <button
                                type="button"
                                data-chat-conversation={conversation.id}
                                className="nostr-chat-conversation-button rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                onClick={() => onOpenConversation(conversation.id)}
                            >
                                <ItemMedia>
                                    <VerifiedUserAvatar
                                        picture={conversation.profile?.picture}
                                        imageAlt={conversation.title}
                                        fallback={conversationInitials(conversation.title, conversation.peerPubkey)}
                                        nip05={conversation.profile?.nip05}
                                        verification={conversation.verification}
                                    />
                                </ItemMedia>

                                <ItemContent className="min-w-0">
                                    <ItemTitle className="nostr-chat-conversation-title-row">
                                        <span className="nostr-chat-conversation-title-content">
                                            <span className="nostr-chat-conversation-title">{conversation.title}</span>
                                        </span>
                                        {conversation.hasUnread ? <span className="nostr-chat-conversation-unread" aria-hidden="true" /> : null}
                                    </ItemTitle>
                                    <ItemDescription className="nostr-chat-conversation-preview truncate">
                                        {conversation.lastMessagePreview || t('chats.list.noMessages')}
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
