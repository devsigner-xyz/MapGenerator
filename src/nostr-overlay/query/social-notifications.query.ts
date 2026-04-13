import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getLastTagValue,
    hasPTag,
    getNumericTagValue,
    type SocialNotificationEvent,
    type SocialNotificationItem,
    type SocialNotificationKind,
    type SocialNotificationsService,
} from '../../nostr/social-notifications-service';
import { nostrOverlayQueryKeys } from './keys';
import {
    createSocialReadStateStorage,
    fallbackStorage,
    normalizeToEpochSeconds,
    type SocialReadStateStorage,
} from './read-state';
import { createSocialQueryOptions } from './options';

const SOCIAL_KINDS = new Set<number>([1, 6, 7, 9735]);
const SOCIAL_NOTIFICATIONS_MAX_ITEMS = 200;

interface UseSocialNotificationsControllerOptions {
    ownerPubkey?: string;
    service: SocialNotificationsService;
    storage?: SocialReadStateStorage;
    now?: () => number;
    maxItems?: number;
}

interface SocialNotificationsControllerState {
    items: SocialNotificationItem[];
    hasUnread: boolean;
    lastReadAt: number;
    isOpen: boolean;
    pendingSnapshot: SocialNotificationItem[];
    isBootstrapping: boolean;
    bootstrapError: string | null;
    open: () => void;
    close: () => void;
    retry: () => Promise<void>;
}

function toSocialNotificationKind(value: number): SocialNotificationKind | null {
    if (value === 1 || value === 6 || value === 7 || value === 9735) {
        return value;
    }

    return null;
}

function shouldIncludeEvent(event: SocialNotificationEvent, ownerPubkey: string): boolean {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (!SOCIAL_KINDS.has(event.kind)) {
        return false;
    }

    if (typeof event.id !== 'string' || event.id.length === 0) {
        return false;
    }

    if (typeof event.pubkey !== 'string' || event.pubkey.length === 0 || event.pubkey === ownerPubkey) {
        return false;
    }

    if (typeof event.created_at !== 'number' || !Number.isFinite(event.created_at)) {
        return false;
    }

    if (!Array.isArray(event.tags)) {
        return false;
    }

    return hasPTag(event.tags, ownerPubkey);
}

function toItem(event: SocialNotificationEvent): SocialNotificationItem | null {
    const kind = toSocialNotificationKind(event.kind);
    if (!kind) {
        return null;
    }

    return {
        id: event.id,
        kind,
        actorPubkey: event.pubkey,
        createdAt: normalizeToEpochSeconds(event.created_at),
        content: event.content,
        targetEventId: getLastTagValue(event.tags, 'e'),
        targetPubkey: getLastTagValue(event.tags, 'p'),
        targetKind: getNumericTagValue(event.tags, 'k'),
        targetAddress: getLastTagValue(event.tags, 'a'),
        rawEvent: event,
    };
}

function sortItems(items: SocialNotificationItem[]): SocialNotificationItem[] {
    return [...items].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return right.createdAt - left.createdAt;
        }

        return left.id.localeCompare(right.id);
    });
}

function upsertNotificationItem(items: SocialNotificationItem[], nextItem: SocialNotificationItem, maxItems: number): SocialNotificationItem[] {
    if (items.some((item) => item.id === nextItem.id)) {
        return items;
    }

    return sortItems([nextItem, ...items]).slice(0, maxItems);
}

function computeHasUnread(items: SocialNotificationItem[], lastReadAt: number): boolean {
    return items.some((item) => item.createdAt > lastReadAt);
}

export function useSocialNotificationsController(
    options: UseSocialNotificationsControllerOptions
): SocialNotificationsControllerState {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const maxItems = Math.max(1, options.maxItems ?? SOCIAL_NOTIFICATIONS_MAX_ITEMS);
    const storage = useMemo(() => {
        if (options.storage) {
            return options.storage;
        }

        const backingStorage = typeof window === 'undefined' ? fallbackStorage : window.localStorage;
        return createSocialReadStateStorage({
            storage: backingStorage,
            version: 'v1',
        });
    }, [options.storage]);

    const [isOpen, setIsOpen] = useState(false);
    const [pendingSnapshot, setPendingSnapshot] = useState<SocialNotificationItem[]>([]);
    const [lastReadAt, setLastReadAt] = useState(() =>
        options.ownerPubkey ? storage.getLastReadAt(options.ownerPubkey) : 0
    );

    const queryClient = useQueryClient();
    const queryKey = useMemo(() => nostrOverlayQueryKeys.notifications({
        ownerPubkey: options.ownerPubkey || '',
        limit: maxItems,
        since: undefined,
    }), [maxItems, options.ownerPubkey]);

    const notificationsQuery = useQuery(createSocialQueryOptions({
        queryKey,
        queryFn: async (): Promise<SocialNotificationItem[]> => {
            if (!options.ownerPubkey) {
                return [];
            }

            const events = await options.service.loadInitialSocial({
                ownerPubkey: options.ownerPubkey,
                limit: maxItems,
            });

            const items: SocialNotificationItem[] = [];
            for (const event of events) {
                if (!shouldIncludeEvent(event, options.ownerPubkey)) {
                    continue;
                }

                const item = toItem(event);
                if (!item) {
                    continue;
                }

                items.push(item);
            }

            return sortItems(items).slice(0, maxItems);
        },
        enabled: Boolean(options.ownerPubkey),
    }));

    useEffect(() => {
        if (!options.ownerPubkey) {
            setLastReadAt(0);
            setPendingSnapshot([]);
            setIsOpen(false);
            return;
        }

        setLastReadAt(storage.getLastReadAt(options.ownerPubkey));
        setPendingSnapshot([]);
        setIsOpen(false);
    }, [options.ownerPubkey, storage]);

    useEffect(() => {
        if (!options.ownerPubkey) {
            return;
        }

        return options.service.subscribeSocial({ ownerPubkey: options.ownerPubkey }, (event) => {
            if (!shouldIncludeEvent(event, options.ownerPubkey!)) {
                return;
            }

            const item = toItem(event);
            if (!item) {
                return;
            }

            queryClient.setQueryData<SocialNotificationItem[]>(queryKey, (current = []) =>
                upsertNotificationItem(current, item, maxItems)
            );
        });
    }, [maxItems, options.ownerPubkey, options.service, queryClient, queryKey]);

    const items = notificationsQuery.data ?? [];
    const hasUnread = useMemo(() => computeHasUnread(items, lastReadAt), [items, lastReadAt]);

    const open = useCallback(() => {
        setPendingSnapshot(items.filter((item) => item.createdAt > lastReadAt));
        setIsOpen(true);

        if (options.ownerPubkey) {
            const nextLastReadAt = Math.max(lastReadAt, normalizeToEpochSeconds(now()));
            setLastReadAt(nextLastReadAt);
            storage.setLastReadAt(options.ownerPubkey, nextLastReadAt);
        }
    }, [items, lastReadAt, now, options.ownerPubkey, storage]);

    const close = useCallback(() => {
        setIsOpen(false);
        setPendingSnapshot([]);
    }, []);

    const retry = useCallback(async () => {
        await notificationsQuery.refetch();
    }, [notificationsQuery]);

    return {
        items,
        hasUnread,
        lastReadAt,
        isOpen,
        pendingSnapshot,
        isBootstrapping: notificationsQuery.isPending,
        bootstrapError: notificationsQuery.error instanceof Error
            ? notificationsQuery.error.message
            : notificationsQuery.error
                ? 'No se pudieron cargar las notificaciones'
                : null,
        open,
        close,
        retry,
    };
}
