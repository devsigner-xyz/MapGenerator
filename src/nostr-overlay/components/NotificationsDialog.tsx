import type { SocialNotificationItem } from '../../nostr/social-notifications-service';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

interface NotificationsDialogProps {
    open: boolean;
    hasUnread: boolean;
    notifications: SocialNotificationItem[];
    onClose: () => void;
}

function notificationLabel(item: SocialNotificationItem): string {
    if (item.kind === 1) {
        return 'Mencion';
    }

    if (item.kind === 6) {
        return 'Repost';
    }

    if (item.kind === 7) {
        return 'Reaccion';
    }

    return 'Zap';
}

function shortPubkey(value: string): string {
    if (!value || value.length < 16) {
        return value || 'desconocido';
    }

    return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function NotificationsDialog({ open, hasUnread, notifications, onClose }: NotificationsDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onClose();
                }
            }}
        >
            <DialogContent className="nostr-dialog nostr-notifications-dialog" aria-label="Notificaciones">
                <DialogTitle className="sr-only">Notificaciones</DialogTitle>
                <DialogDescription className="sr-only">Listado de notificaciones sociales pendientes.</DialogDescription>

                <div className="nostr-notifications-dialog-header">
                    <p className="nostr-notifications-dialog-title">
                        Notificaciones
                        {hasUnread ? <span className="nostr-notifications-unread-dot" aria-hidden="true" /> : null}
                    </p>
                </div>

                {notifications.length === 0 ? (
                    <Empty className="nostr-notifications-empty">
                        <EmptyHeader>
                            <EmptyTitle>Sin notificaciones</EmptyTitle>
                            <EmptyDescription>No tienes notificaciones pendientes.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <ul className="nostr-notifications-list">
                        {notifications.map((item) => (
                            <li key={item.id} className="nostr-notifications-item">
                                <p className="nostr-notifications-item-title">{notificationLabel(item)}</p>
                                <p className="nostr-notifications-item-meta">{shortPubkey(item.actorPubkey)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
