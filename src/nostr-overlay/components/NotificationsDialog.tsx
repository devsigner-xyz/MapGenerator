import type { SocialNotificationItem } from '../../nostr/social-notifications-service';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

interface NotificationsDialogProps {
    open: boolean;
    hasUnread: boolean;
    notifications: SocialNotificationItem[];
    onClose: () => void;
    variant?: 'dialog' | 'surface';
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

export function NotificationsDialog({ open, hasUnread, notifications, onClose, variant = 'dialog' }: NotificationsDialogProps) {
    const content = (
        <>
            <header className="nostr-page-header">
                <h3 className="nostr-page-header-inline-title">
                    Notificaciones
                    {hasUnread ? <span className="nostr-notifications-unread-dot" aria-hidden="true" /> : null}
                </h3>
                <p>Actividad reciente de personas y contenido que sigues.</p>
            </header>

            <section className="nostr-page-content">
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
            </section>
        </>
    );

    if (variant === 'surface') {
        return (
            <section className="nostr-routed-surface" aria-label="Notificaciones">
                <div className="nostr-routed-surface-content">
                    <div className="nostr-notifications-page nostr-routed-surface-panel nostr-page-layout">
                        {content}
                    </div>
                </div>
            </section>
        );
    }

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
                {content}
            </DialogContent>
        </Dialog>
    );
}
