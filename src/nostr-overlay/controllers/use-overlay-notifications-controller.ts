import { useEffect, useMemo } from 'react';
import type { SocialNotificationsService } from '../../nostr/social-notifications-service';
import { useSocialNotificationsController } from '../query/social-notifications.query';
import { buildNotificationInboxSections, type NotificationInboxSections } from '../query/social-notifications-inbox';

type SocialNotificationsController = ReturnType<typeof useSocialNotificationsController>;

interface UseOverlayNotificationsControllerOptions {
    ownerPubkey?: string;
    canWrite: boolean;
    isNotificationsRoute: boolean;
    service: SocialNotificationsService;
}

export interface OverlayNotificationsController {
    socialNotifications: SocialNotificationsController;
    socialState: SocialNotificationsController;
    canAccessSocialNotifications: boolean;
    notificationInboxSections: NotificationInboxSections;
}

export function useOverlayNotificationsController(options: UseOverlayNotificationsControllerOptions): OverlayNotificationsController {
    const canAccessSocialNotifications = Boolean(options.ownerPubkey && options.canWrite && options.service);
    const socialNotifications = useSocialNotificationsController({
        ...(canAccessSocialNotifications && options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
        service: options.service,
    });
    const socialState = socialNotifications;

    useEffect(() => {
        if (options.isNotificationsRoute && canAccessSocialNotifications) {
            if (!socialState.isOpen) {
                socialNotifications.open();
            }
            return;
        }

        if (socialState.isOpen) {
            socialNotifications.close();
        }
    }, [
        options.isNotificationsRoute,
        canAccessSocialNotifications,
        socialState.isOpen,
        socialNotifications.close,
        socialNotifications.open,
    ]);

    const notificationInboxSections = useMemo(
        () => buildNotificationInboxSections({
            newNotifications: socialState.pendingSnapshot,
            recentNotifications: socialState.items,
        }),
        [socialState.items, socialState.pendingSnapshot],
    );

    return {
        socialNotifications,
        socialState,
        canAccessSocialNotifications,
        notificationInboxSections,
    };
}
