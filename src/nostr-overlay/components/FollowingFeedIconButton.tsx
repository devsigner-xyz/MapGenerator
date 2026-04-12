import { Button } from '@/components/ui/button';

interface FollowingFeedIconButtonProps {
    hasUnread?: boolean;
    onClick: () => void;
}

export function FollowingFeedIconButton({ hasUnread = false, onClick }: FollowingFeedIconButtonProps) {
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className="nostr-settings-button nostr-following-feed-icon-button"
            aria-label="Abrir feed de seguidos"
            title="Feed siguiendo"
            onClick={onClick}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11zm3 1a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H7zm0 4a1 1 0 1 0 0 2h6.5a1 1 0 1 0 0-2H7zm0 4a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" />
            </svg>
            {hasUnread ? <span className="nostr-following-feed-unread-dot" aria-hidden="true" /> : null}
        </Button>
    );
}
