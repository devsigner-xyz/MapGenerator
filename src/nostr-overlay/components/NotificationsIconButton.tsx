import { Button } from '@/components/ui/button';

interface NotificationsIconButtonProps {
    hasUnread: boolean;
    onClick: () => void;
}

export function NotificationsIconButton({ hasUnread, onClick }: NotificationsIconButtonProps) {
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className="nostr-settings-button nostr-notifications-icon-button"
            aria-label="Abrir notificaciones"
            title="Notificaciones"
            onClick={onClick}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 3.5a4.5 4.5 0 0 0-4.5 4.5v2.2c0 1.5-.4 2.8-1.1 3.7l-1.2 1.6a1.2 1.2 0 0 0 1 1.9h11.6a1.2 1.2 0 0 0 1-1.9l-1.2-1.6c-.7-.9-1.1-2.2-1.1-3.7V8A4.5 4.5 0 0 0 12 3.5zM9.4 19.6a2.6 2.6 0 0 0 5.2 0" />
            </svg>
            {hasUnread ? <span className="nostr-notifications-unread-dot" aria-hidden="true" /> : null}
        </Button>
    );
}
