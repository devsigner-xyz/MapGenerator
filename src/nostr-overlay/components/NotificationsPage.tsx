import type { SocialNotificationItem } from '../../nostr/social-notifications-service';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlayUnreadIndicator } from './OverlayUnreadIndicator';
import { useI18n } from '@/i18n/useI18n';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';

interface NotificationsPageProps {
    hasUnread: boolean;
    notifications: SocialNotificationItem[];
}

function notificationLabel(item: SocialNotificationItem, t: ReturnType<typeof useI18n>['t']): string {
    if (item.kind === 1) {
        return t('notifications.kind.mention');
    }

    if (item.kind === 6) {
        return t('notifications.kind.repost');
    }

    if (item.kind === 7) {
        return t('notifications.kind.reaction');
    }

    return t('notifications.kind.zap');
}

function shortPubkey(value: string, t: ReturnType<typeof useI18n>['t']): string {
    if (!value || value.length < 16) {
        return value || t('notifications.actor.unknown');
    }

    return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function NotificationsPage({ hasUnread, notifications }: NotificationsPageProps) {
    const { t } = useI18n();
    return (
        <section className="nostr-routed-surface" aria-label={t('notifications.title')}>
            <div className="nostr-routed-surface-content">
                <div className="nostr-notifications-page nostr-routed-surface-panel nostr-page-layout">
                    <OverlayPageHeader
                        title={t('notifications.title')}
                        description={t('notifications.description')}
                        indicator={hasUnread ? <OverlayUnreadIndicator className="nostr-notifications-unread-dot" srLabel={t('notifications.unread')} /> : null}
                    />

                    <section className="grid min-h-0 gap-2.5">
                        {notifications.length === 0 ? (
                            <div className="nostr-notifications-empty-state">
                                <Empty className="nostr-notifications-empty">
                                    <EmptyHeader>
                                        <EmptyTitle>{t('notifications.empty.title')}</EmptyTitle>
                                        <EmptyDescription>{t('notifications.empty.description')}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            </div>
                        ) : (
                            <ul className="nostr-notifications-list">
                                {notifications.map((item) => (
                                    <li key={item.id}>
                                        <Item variant="outline" size="sm">
                                            <ItemContent>
                                                <ItemTitle>{notificationLabel(item, t)}</ItemTitle>
                                                <ItemDescription>{shortPubkey(item.actorPubkey, t)}</ItemDescription>
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
