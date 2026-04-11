import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ChatConversationList } from './ChatConversationList';
import { ChatConversationDetail } from './ChatConversationDetail';

export interface ChatConversationSummary {
    id: string;
    peerPubkey: string;
    title: string;
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

interface ChatDialogProps {
    open: boolean;
    hasUnreadGlobal: boolean;
    isLoadingConversations?: boolean;
    conversations: ChatConversationSummary[];
    messages: ChatDetailMessage[];
    activeConversationId: string | null;
    onClose: () => void;
    onOpenConversation: (conversationId: string) => void;
    onBackToList: () => void;
    onSendMessage: (plaintext: string) => Promise<void> | void;
    composerAutoFocusKey?: string;
    canSend?: boolean;
    disabledReason?: string;
}

export function ChatDialog({
    open,
    hasUnreadGlobal,
    isLoadingConversations = false,
    conversations,
    messages,
    activeConversationId,
    onClose,
    onOpenConversation,
    onBackToList,
    onSendMessage,
    composerAutoFocusKey,
    canSend = true,
    disabledReason,
}: ChatDialogProps) {
    const activeConversation = activeConversationId
        ? conversations.find((conversation) => conversation.id === activeConversationId)
        : undefined;

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onClose();
                }
            }}
        >
            <DialogContent className="nostr-dialog nostr-chat-dialog sm:max-w-none" showCloseButton={false} aria-label="Chats">
                <DialogTitle className="sr-only">Chats</DialogTitle>
                <DialogDescription className="sr-only">Mensajería directa 1 a 1.</DialogDescription>

                <div className="nostr-chat-dialog-header">
                    <p className="nostr-chat-dialog-title">
                        Chats
                        {hasUnreadGlobal ? <span className="nostr-chat-unread-dot" aria-hidden="true" /> : null}
                    </p>
                    <button type="button" className="nostr-dialog-close" onClick={onClose} aria-label="Cerrar chats">
                        ×
                    </button>
                </div>

                <div className="nostr-chat-layout">
                    <div className="nostr-chat-list-panel">
                        <ChatConversationList
                            conversations={conversations}
                            loading={isLoadingConversations}
                            activeConversationId={activeConversationId}
                            onOpenConversation={onOpenConversation}
                        />
                    </div>

                    <div className="nostr-chat-detail-panel">
                        <ChatConversationDetail
                            conversation={activeConversation}
                            messages={messages}
                            onBackToList={onBackToList}
                            onSendMessage={onSendMessage}
                            composerAutoFocusKey={composerAutoFocusKey}
                            canSend={canSend}
                            disabledReason={disabledReason}
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
