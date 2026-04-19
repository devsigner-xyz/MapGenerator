import { ChatConversationList } from './ChatConversationList';
import { ChatConversationDetail } from './ChatConversationDetail';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlayUnreadIndicator } from './OverlayUnreadIndicator';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

export interface ChatConversationSummary {
    id: string;
    peerPubkey: string;
    title: string;
    profile?: NostrProfile;
    verification?: Nip05ValidationResult;
    lastMessagePreview: string;
    lastMessageAt: number;
    hasUnread: boolean;
}

export interface ChatDetailMessage {
    id: string;
    direction: 'incoming' | 'outgoing';
    plaintext: string;
    createdAt: number;
    deliveryState: 'pending' | 'sent' | 'failed';
    isUndecryptable?: boolean;
}

interface ChatsPageProps {
    hasUnreadGlobal: boolean;
    isLoadingConversations?: boolean;
    conversations: ChatConversationSummary[];
    messages: ChatDetailMessage[];
    activeConversationId: string | null;
    onOpenConversation: (conversationId: string) => void;
    onBackToList: () => void;
    onSendMessage: (plaintext: string) => Promise<void> | void;
    composerAutoFocusKey?: string;
    canSend?: boolean;
    disabledReason?: string;
}

export function ChatsPage({
    hasUnreadGlobal,
    isLoadingConversations = false,
    conversations,
    messages,
    activeConversationId,
    onOpenConversation,
    onBackToList,
    onSendMessage,
    composerAutoFocusKey,
    canSend = true,
    disabledReason,
}: ChatsPageProps) {
    const showBootstrappingState = isLoadingConversations && conversations.length === 0;
    const activeConversation = activeConversationId
        ? conversations.find((conversation) => conversation.id === activeConversationId)
        : undefined;

    return (
        <section className="nostr-routed-surface" aria-label="Chats">
            <div className="nostr-routed-surface-content">
                {showBootstrappingState ? (
                    <div className="nostr-chats-page nostr-routed-surface-panel nostr-page-layout nostr-chats-loading-page" data-chat-source="query">
                        <Empty className="nostr-chats-loading-empty">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Spinner />
                                </EmptyMedia>
                                <EmptyTitle>Cargando conversaciones</EmptyTitle>
                                <EmptyDescription>Estamos obteniendo tus chats.</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </div>
                ) : (
                    <div className="nostr-chats-page nostr-routed-surface-panel nostr-page-layout" data-chat-source="query">
                        <OverlayPageHeader
                            title="Chats"
                            indicator={hasUnreadGlobal ? <OverlayUnreadIndicator className="nostr-chat-unread-dot" srLabel="Hay chats sin leer" /> : null}
                        />

                        <div className="nostr-chat-layout">
                            <Card variant="elevated" size="sm" className="nostr-chat-list-panel gap-0 overflow-hidden py-0">
                                <CardContent className="min-h-0 flex-1 px-3 py-3">
                                <ChatConversationList
                                    conversations={conversations}
                                    loading={isLoadingConversations}
                                    activeConversationId={activeConversationId}
                                    onOpenConversation={onOpenConversation}
                                />
                                </CardContent>
                            </Card>

                            <Card variant="elevated" size="sm" className="nostr-chat-detail-panel gap-0 overflow-hidden py-0">
                                <CardContent className="min-h-0 flex-1 px-3 py-3">
                                <ChatConversationDetail
                                    {...(activeConversation ? { conversation: activeConversation } : {})}
                                    messages={messages}
                                    onBackToList={onBackToList}
                                    onSendMessage={onSendMessage}
                                    {...(composerAutoFocusKey ? { composerAutoFocusKey } : {})}
                                    canSend={canSend}
                                    {...(disabledReason ? { disabledReason } : {})}
                                />
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
