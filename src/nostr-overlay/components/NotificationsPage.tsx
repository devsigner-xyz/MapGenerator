import type { SocialNotificationItem } from '../../nostr/social-notifications-service';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

interface NotificationsPageProps {
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

export function NotificationsPage({ hasUnread, notifications, onClose }: NotificationsPageProps) {
    return (
        <section className="nostr-routed-surface" aria-label="Notificaciones">
            <div className="nostr-routed-surface-content">
                <div className="nostr-notifications-page nostr-routed-surface-panel nostr-page-layout">
                    <header className="nostr-page-header">
                        <div className="flex items-center justify-between gap-2">
                            <h4 className="scroll-m-20 inline-flex items-center gap-1.5 text-xl font-semibold tracking-tight">
                                Notificaciones
                                {hasUnread ? <span className="nostr-notifications-unread-dot" aria-hidden="true" /> : null}
                            </h4>
                            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar notificaciones">
                                Cerrar
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">Actividad reciente de personas y contenido que sigues.</p>
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
                </div>
            </div>
        </section>
    );
}
