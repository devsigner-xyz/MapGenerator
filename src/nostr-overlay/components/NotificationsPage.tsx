import type { SocialNotificationItem } from '../../nostr/social-notifications-service';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlayUnreadIndicator } from './OverlayUnreadIndicator';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';

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
                    <OverlayPageHeader
                        title="Notificaciones"
                        description="Actividad reciente de personas y contenido que sigues."
                        indicator={hasUnread ? <OverlayUnreadIndicator className="nostr-notifications-unread-dot" srLabel="Hay notificaciones sin leer" /> : null}
                        actions={(
                            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar notificaciones">
                                Cerrar
                            </Button>
                        )}
                    />

                    <section className="nostr-page-content">
                        {notifications.length === 0 ? (
                            <div className="nostr-notifications-empty-state">
                                <Empty className="nostr-notifications-empty">
                                    <EmptyHeader>
                                        <EmptyTitle>Sin notificaciones</EmptyTitle>
                                        <EmptyDescription>No tienes notificaciones pendientes.</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            </div>
                        ) : (
                            <ul className="nostr-notifications-list">
                                {notifications.map((item) => (
                                    <li key={item.id}>
                                        <Item variant="outline" size="sm">
                                            <ItemContent>
                                                <ItemTitle>{notificationLabel(item)}</ItemTitle>
                                                <ItemDescription>{shortPubkey(item.actorPubkey)}</ItemDescription>
                                            </ItemContent>
                                        </Item>
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
