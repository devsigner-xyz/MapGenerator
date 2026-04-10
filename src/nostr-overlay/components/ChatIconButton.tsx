import { Button } from '@/components/ui/button';

interface ChatIconButtonProps {
    hasUnread: boolean;
    onClick: () => void;
}

export function ChatIconButton({ hasUnread, onClick }: ChatIconButtonProps) {
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className="nostr-settings-button nostr-chat-icon-button"
            aria-label="Abrir chats"
            title="Chats"
            onClick={onClick}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H10l-3.8 3.2a.9.9 0 0 1-1.5-.7V16A2.8 2.8 0 0 1 2 13.2V6.8zm4.2 2.4a1 1 0 1 0 0 2h7.6a1 1 0 1 0 0-2H8.2z" />
            </svg>
            {hasUnread ? <span className="nostr-chat-unread-dot" aria-hidden="true" /> : null}
        </Button>
    );
}
