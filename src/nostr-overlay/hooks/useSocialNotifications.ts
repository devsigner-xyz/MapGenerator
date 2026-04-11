import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
    getLastTagValue,
    getNumericTagValue,
    hasPTag,
    type SocialNotificationEvent,
    type SocialNotificationItem,
    type SocialNotificationKind,
    type SocialNotificationsService,
} from '../../nostr/social-notifications-service';

type StorageVersion = 'v1';

export const SOCIAL_NOTIFICATIONS_MAX_ITEMS = 200;

export interface SocialReadStateStorage {
    getLastReadAt(ownerPubkey: string): number;
    setLastReadAt(ownerPubkey: string, timestampSec: number): void;
}

export interface SocialNotificationsState {
    items: SocialNotificationItem[];
    hasUnread: boolean;
    lastReadAt: number;
    isDialogOpen: boolean;
    pendingSnapshot: SocialNotificationItem[];
    isBootstrapping: boolean;
    bootstrapError: string | null;
}

interface CreateSocialReadStateStorageOptions {
    storage: Pick<Storage, 'getItem' | 'setItem'>;
    version: StorageVersion;
}

interface CreateSocialNotificationsStoreOptions {
    ownerPubkey?: string;
    service: SocialNotificationsService;
    storage: SocialReadStateStorage;
    now?: () => number;
    maxItems?: number;
}

interface UseSocialNotificationsOptions {
    ownerPubkey?: string;
    service: SocialNotificationsService;
    storage?: SocialReadStateStorage;
    now?: () => number;
    maxItems?: number;
}

export interface SocialNotificationsStore {
    getState(): SocialNotificationsState;
    getVersion(): number;
    subscribe(listener: () => void): () => void;
    start(): Promise<void>;
    dispose(): void;
    openDialog(): void;
    closeDialog(): void;
    retry(): Promise<void>;
}

const SOCIAL_KINDS = new Set<number>([1, 6, 7, 9735]);

function safeJsonParse<T>(value: string | null): T | null {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function toEpochSeconds(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    if (value > 1_000_000_000_000) {
        return Math.floor(value / 1000);
    }

    return Math.floor(value);
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
        createdAt: toEpochSeconds(event.created_at),
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

function computeHasUnread(items: SocialNotificationItem[], lastReadAt: number): boolean {
    return items.some((item) => item.createdAt > lastReadAt);
}

export function buildSocialLastReadStorageKey(ownerPubkey: string, version: StorageVersion = 'v1'): string {
    return `nostr-overlay:social:${version}:last-read:${ownerPubkey}`;
}

export function createSocialReadStateStorage(options: CreateSocialReadStateStorageOptions): SocialReadStateStorage {
    return {
        getLastReadAt(ownerPubkey) {
            const key = buildSocialLastReadStorageKey(ownerPubkey, options.version);
            const parsed = safeJsonParse<{ lastReadAt?: number }>(options.storage.getItem(key));
            if (!parsed || typeof parsed.lastReadAt !== 'number') {
                return 0;
            }

            return toEpochSeconds(parsed.lastReadAt);
        },

        setLastReadAt(ownerPubkey, timestampSec) {
            const key = buildSocialLastReadStorageKey(ownerPubkey, options.version);
            options.storage.setItem(key, JSON.stringify({ lastReadAt: toEpochSeconds(timestampSec) }));
        },
    };
}

export function createSocialNotificationsStore(options: CreateSocialNotificationsStoreOptions): SocialNotificationsStore {
    const ownerPubkey = options.ownerPubkey;
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const maxItems = Math.max(1, options.maxItems ?? SOCIAL_NOTIFICATIONS_MAX_ITEMS);
    const initialLastReadAt = ownerPubkey ? options.storage.getLastReadAt(ownerPubkey) : 0;
    const state: SocialNotificationsState = {
        items: [],
        hasUnread: false,
        lastReadAt: initialLastReadAt,
        isDialogOpen: false,
        pendingSnapshot: [],
        isBootstrapping: false,
        bootstrapError: null,
    };
    const listeners = new Set<() => void>();
    let version = 0;
    let releaseSubscription: (() => void) | null = null;
    let startPromise: Promise<void> | null = null;
    let disposed = false;

    const emitChange = (): void => {
        version += 1;
        for (const listener of listeners) {
            listener();
        }
    };

    const insertItem = (item: SocialNotificationItem): void => {
        if (state.items.some((existing) => existing.id === item.id)) {
            return;
        }

        const merged = sortItems([item, ...state.items]);
        state.items = merged.slice(0, maxItems);
        state.hasUnread = computeHasUnread(state.items, state.lastReadAt);
    };

    const ingestEvent = (event: SocialNotificationEvent): void => {
        if (!ownerPubkey || !shouldIncludeEvent(event, ownerPubkey)) {
            return;
        }

        const item = toItem(event);
        if (!item) {
            return;
        }

        insertItem(item);
        emitChange();
    };

    const bootstrapAndSubscribe = async (): Promise<void> => {
        if (!ownerPubkey) {
            return;
        }

        state.isBootstrapping = true;
        state.bootstrapError = null;
        emitChange();

        try {
            const initialEvents = await options.service.loadInitialSocial({
                ownerPubkey,
                limit: maxItems,
            });

            for (const event of initialEvents) {
                if (!shouldIncludeEvent(event, ownerPubkey)) {
                    continue;
                }

                const item = toItem(event);
                if (!item) {
                    continue;
                }

                insertItem(item);
            }

            releaseSubscription?.();
            releaseSubscription = options.service.subscribeSocial({ ownerPubkey }, (event) => {
                ingestEvent(event);
            });

            state.isBootstrapping = false;
            state.bootstrapError = null;
            state.hasUnread = computeHasUnread(state.items, state.lastReadAt);
            emitChange();
        } catch (error) {
            state.isBootstrapping = false;
            state.bootstrapError = error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones';
            emitChange();
        }
    };

    return {
        getState() {
            return state;
        },

        getVersion() {
            return version;
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        async start() {
            if (!ownerPubkey || releaseSubscription || disposed) {
                return;
            }

            if (startPromise) {
                await startPromise;
                return;
            }

            startPromise = bootstrapAndSubscribe();
            try {
                await startPromise;
            } finally {
                startPromise = null;
            }
        },

        dispose() {
            disposed = true;
            releaseSubscription?.();
            releaseSubscription = null;
        },

        openDialog() {
            state.pendingSnapshot = state.items.filter((item) => item.createdAt > state.lastReadAt);
            state.isDialogOpen = true;

            if (ownerPubkey) {
                const nextLastReadAt = Math.max(state.lastReadAt, toEpochSeconds(now()));
                state.lastReadAt = nextLastReadAt;
                options.storage.setLastReadAt(ownerPubkey, nextLastReadAt);
            }

            state.hasUnread = computeHasUnread(state.items, state.lastReadAt);
            emitChange();
        },

        closeDialog() {
            state.isDialogOpen = false;
            state.pendingSnapshot = [];
            emitChange();
        },

        async retry() {
            if (!ownerPubkey) {
                return;
            }

            await bootstrapAndSubscribe();
        },
    };
}

const fallbackStorage: Pick<Storage, 'getItem' | 'setItem'> = {
    getItem() {
        return null;
    },
    setItem() {
        return;
    },
};

export function useSocialNotifications(options: UseSocialNotificationsOptions): SocialNotificationsStore {
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

    const store = useMemo(
        () =>
            createSocialNotificationsStore({
                ownerPubkey: options.ownerPubkey,
                service: options.service,
                storage,
                now: options.now,
                maxItems: options.maxItems,
            }),
        [options.ownerPubkey, options.service, storage, options.now, options.maxItems]
    );

    useEffect(() => {
        void store.start();
        return () => {
            store.dispose();
        };
    }, [store]);

    useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);

    return store;
}
