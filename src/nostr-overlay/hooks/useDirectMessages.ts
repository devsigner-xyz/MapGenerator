import { useEffect, useMemo } from 'react';
import type { DmMessage, SentIndexItem } from '../../nostr/dm-service';

type StorageVersion = 'v1' | 'v2';

export const DM_SENT_INDEX_MAX_ITEMS = 2_000;
export const DM_SENT_INDEX_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface DmReadStateStorage {
    getLastReadAt(ownerPubkey: string, conversationId: string): number;
    setLastReadAt(ownerPubkey: string, conversationId: string, timestampSec: number): void;
    getSentIndex(ownerPubkey: string): SentIndexItem[];
    setSentIndex(ownerPubkey: string, items: SentIndexItem[]): void;
}

export interface DirectMessageItem extends DmMessage {
    isUndecryptable?: boolean;
}

export interface DirectMessageConversationState {
    id: string;
    messages: DirectMessageItem[];
    lastReadAt: number;
    hasUnread: boolean;
}

export interface DirectMessagesState {
    isListOpen: boolean;
    activeConversationId: string | null;
    conversations: Record<string, DirectMessageConversationState>;
    hasUnreadGlobal: boolean;
}

type DmSendInput = {
    ownerPubkey: string;
    peerPubkey: string;
    plaintext: string;
    clientMessageId: string;
};

export interface DirectMessagesService {
    subscribeInbox: (input: { ownerPubkey: string }, onMessage: (message: DirectMessageItem) => void) => (() => void) | void;
    sendDm?: (input: DmSendInput) => Promise<DirectMessageItem>;
}

interface CreateDmReadStateStorageOptions {
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    now: () => number;
    version: StorageVersion;
}

interface CreateDirectMessagesStoreOptions {
    ownerPubkey?: string;
    dmService: DirectMessagesService;
    storage: DmReadStateStorage;
    now?: () => number;
}

interface UseDirectMessagesOptions extends CreateDirectMessagesStoreOptions {}

interface DirectMessagesStore {
    getState: () => DirectMessagesState;
    start: () => void;
    dispose: () => void;
    openList: () => void;
    openConversation: (conversationId: string) => void;
    markConversationRead: (conversationId: string, timestampSec?: number) => void;
    ingestIncoming: (message: DirectMessageItem) => void;
    sendMessage: (peerPubkey: string, plaintext: string) => Promise<DirectMessageItem | null>;
}

interface SubscriptionEntry {
    listeners: Set<(message: DirectMessageItem) => void>;
    unsubscribe: () => void;
    refCount: number;
}

const ownerSubscriptions = new Map<string, SubscriptionEntry>();

function toEpochSeconds(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    if (value > 1_000_000_000_000) {
        return Math.floor(value / 1000);
    }

    return Math.floor(value);
}

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

function ensureConversation(
    conversations: Record<string, DirectMessageConversationState>,
    ownerPubkey: string,
    conversationId: string,
    storage: DmReadStateStorage
): DirectMessageConversationState {
    const existing = conversations[conversationId];
    if (existing) {
        return existing;
    }

    const created: DirectMessageConversationState = {
        id: conversationId,
        messages: [],
        lastReadAt: storage.getLastReadAt(ownerPubkey, conversationId),
        hasUnread: false,
    };

    conversations[conversationId] = created;
    return created;
}

function computeConversationUnread(conversation: DirectMessageConversationState): boolean {
    return conversation.messages.some((message) => message.direction === 'incoming' && toEpochSeconds(message.createdAt) > conversation.lastReadAt);
}

function computeHasUnreadGlobal(conversations: Record<string, DirectMessageConversationState>): boolean {
    return Object.values(conversations).some((conversation) => conversation.hasUnread);
}

function compareMessages(left: DirectMessageItem, right: DirectMessageItem): number {
    const leftTime = toEpochSeconds(left.createdAt);
    const rightTime = toEpochSeconds(right.createdAt);
    if (leftTime !== rightTime) {
        return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
}

function normalizeSentIndex(items: SentIndexItem[], nowSec: number): SentIndexItem[] {
    const minCreatedAt = nowSec - DM_SENT_INDEX_MAX_AGE_SECONDS;

    return items
        .filter((item) => toEpochSeconds(item.createdAtSec) >= minCreatedAt)
        .sort((left, right) => toEpochSeconds(right.createdAtSec) - toEpochSeconds(left.createdAtSec))
        .slice(0, DM_SENT_INDEX_MAX_ITEMS);
}

export function buildSeenStorageKey(ownerPubkey: string, conversationId: string, version: StorageVersion = 'v1'): string {
    return `nostr-overlay:dm:${version}:seen:${ownerPubkey}:${conversationId}`;
}

export function buildSentIndexStorageKey(ownerPubkey: string, version: StorageVersion = 'v1'): string {
    return `nostr-overlay:dm:${version}:sent-index:${ownerPubkey}`;
}

export function createDmReadStateStorage(options: CreateDmReadStateStorageOptions): DmReadStateStorage {
    const migrateSeenIfNeeded = (ownerPubkey: string, conversationId: string): number | null => {
        if (options.version !== 'v2') {
            return null;
        }

        const v2Key = buildSeenStorageKey(ownerPubkey, conversationId, 'v2');
        const v2Data = safeJsonParse<{ lastReadAt?: number }>(options.storage.getItem(v2Key));
        if (v2Data && typeof v2Data.lastReadAt === 'number') {
            return toEpochSeconds(v2Data.lastReadAt);
        }

        const v1Key = buildSeenStorageKey(ownerPubkey, conversationId, 'v1');
        const v1Data = safeJsonParse<{ lastReadAt?: number }>(options.storage.getItem(v1Key));
        if (!v1Data || typeof v1Data.lastReadAt !== 'number') {
            return null;
        }

        const lastReadAt = toEpochSeconds(v1Data.lastReadAt);
        options.storage.setItem(v2Key, JSON.stringify({ lastReadAt }));
        options.storage.removeItem(v1Key);
        return lastReadAt;
    };

    return {
        getLastReadAt(ownerPubkey, conversationId) {
            const migrated = migrateSeenIfNeeded(ownerPubkey, conversationId);
            if (typeof migrated === 'number') {
                return migrated;
            }

            const key = buildSeenStorageKey(ownerPubkey, conversationId, options.version);
            const parsed = safeJsonParse<{ lastReadAt?: number }>(options.storage.getItem(key));
            if (!parsed || typeof parsed.lastReadAt !== 'number') {
                return 0;
            }

            return toEpochSeconds(parsed.lastReadAt);
        },

        setLastReadAt(ownerPubkey, conversationId, timestampSec) {
            const key = buildSeenStorageKey(ownerPubkey, conversationId, options.version);
            options.storage.setItem(key, JSON.stringify({ lastReadAt: toEpochSeconds(timestampSec) }));
        },

        getSentIndex(ownerPubkey) {
            const key = buildSentIndexStorageKey(ownerPubkey, options.version);
            const parsed = safeJsonParse<SentIndexItem[]>(options.storage.getItem(key));
            const normalized = normalizeSentIndex(Array.isArray(parsed) ? parsed : [], toEpochSeconds(options.now()));
            options.storage.setItem(key, JSON.stringify(normalized));
            return normalized;
        },

        setSentIndex(ownerPubkey, items) {
            const key = buildSentIndexStorageKey(ownerPubkey, options.version);
            const normalized = normalizeSentIndex(items, toEpochSeconds(options.now()));
            options.storage.setItem(key, JSON.stringify(normalized));
        },
    };
}

function registerOwnerSubscription(
    ownerPubkey: string,
    dmService: DirectMessagesService,
    listener: (message: DirectMessageItem) => void
): () => void {
    const existing = ownerSubscriptions.get(ownerPubkey);
    if (existing) {
        existing.refCount += 1;
        existing.listeners.add(listener);
        return () => {
            existing.listeners.delete(listener);
            existing.refCount -= 1;
            if (existing.refCount <= 0) {
                existing.unsubscribe();
                ownerSubscriptions.delete(ownerPubkey);
            }
        };
    }

    const listeners = new Set<(message: DirectMessageItem) => void>();
    listeners.add(listener);

    const stop = dmService.subscribeInbox({ ownerPubkey }, (message) => {
        for (const currentListener of listeners) {
            currentListener(message);
        }
    });

    const entry: SubscriptionEntry = {
        listeners,
        refCount: 1,
        unsubscribe: typeof stop === 'function' ? stop : () => {},
    };
    ownerSubscriptions.set(ownerPubkey, entry);

    return () => {
        entry.listeners.delete(listener);
        entry.refCount -= 1;
        if (entry.refCount <= 0) {
            entry.unsubscribe();
            ownerSubscriptions.delete(ownerPubkey);
        }
    };
}

export function createDirectMessagesStore(options: CreateDirectMessagesStoreOptions): DirectMessagesStore {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const state: DirectMessagesState = {
        isListOpen: false,
        activeConversationId: null,
        conversations: {},
        hasUnreadGlobal: false,
    };

    const ownerPubkey = options.ownerPubkey;
    let releaseSubscription: (() => void) | null = null;

    const ingestMessage = (message: DirectMessageItem): void => {
        if (!ownerPubkey) {
            return;
        }

        const conversation = ensureConversation(state.conversations, ownerPubkey, message.conversationId, options.storage);
        if (!conversation.messages.some((currentMessage) => currentMessage.id === message.id)) {
            conversation.messages.push(message);
            conversation.messages.sort(compareMessages);
        }

        conversation.hasUnread = computeConversationUnread(conversation);
        state.hasUnreadGlobal = computeHasUnreadGlobal(state.conversations);
    };

    const markRead = (conversationId: string, timestampSec?: number): void => {
        if (!ownerPubkey) {
            return;
        }

        const conversation = ensureConversation(state.conversations, ownerPubkey, conversationId, options.storage);
        const maxVisibleCreatedAt = conversation.messages.reduce((maxValue, message) => Math.max(maxValue, toEpochSeconds(message.createdAt)), 0);
        const nextLastReadAt = Math.max(conversation.lastReadAt, timestampSec ?? maxVisibleCreatedAt);
        conversation.lastReadAt = toEpochSeconds(nextLastReadAt);
        options.storage.setLastReadAt(ownerPubkey, conversationId, conversation.lastReadAt);
        conversation.hasUnread = computeConversationUnread(conversation);
        state.hasUnreadGlobal = computeHasUnreadGlobal(state.conversations);
    };

    return {
        getState() {
            return state;
        },

        start() {
            if (!ownerPubkey || releaseSubscription) {
                return;
            }

            releaseSubscription = registerOwnerSubscription(ownerPubkey, options.dmService, (message) => {
                ingestMessage(message);
            });
        },

        dispose() {
            if (!releaseSubscription) {
                return;
            }

            releaseSubscription();
            releaseSubscription = null;
        },

        openList() {
            state.isListOpen = true;
            state.activeConversationId = null;
        },

        openConversation(conversationId) {
            state.isListOpen = true;
            state.activeConversationId = conversationId;
            markRead(conversationId);
        },

        markConversationRead(conversationId, timestampSec) {
            markRead(conversationId, timestampSec);
        },

        ingestIncoming(message) {
            ingestMessage({
                ...message,
                createdAt: toEpochSeconds(message.createdAt),
            });
        },

        async sendMessage(peerPubkey, plaintext) {
            if (!ownerPubkey || !options.dmService.sendDm) {
                return null;
            }

            const clientMessageId = `client-${toEpochSeconds(now())}-${Math.random().toString(16).slice(2, 8)}`;
            const pendingMessage: DirectMessageItem = {
                id: `pending:${clientMessageId}`,
                clientMessageId,
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing',
                createdAt: toEpochSeconds(now()),
                plaintext,
                deliveryState: 'pending',
            };

            ingestMessage(pendingMessage);

            try {
                const sent = await options.dmService.sendDm({
                    ownerPubkey,
                    peerPubkey,
                    plaintext,
                    clientMessageId,
                });

                const conversation = ensureConversation(state.conversations, ownerPubkey, peerPubkey, options.storage);
                conversation.messages = conversation.messages.filter((message) => message.clientMessageId !== clientMessageId);
                conversation.messages.push(sent);
                conversation.messages.sort(compareMessages);

                const sentIndex = options.storage.getSentIndex(ownerPubkey);
                sentIndex.unshift({
                    clientMessageId,
                    conversationId: peerPubkey,
                    rumorEventId: sent.rumorEventId,
                    sealEventId: sent.sealEventId,
                    giftWrapEventId: sent.giftWrapEventId,
                    createdAtSec: toEpochSeconds(sent.createdAt),
                    deliveryState: sent.deliveryState,
                    targetRelays: [],
                    plaintext: sent.plaintext,
                });
                options.storage.setSentIndex(ownerPubkey, sentIndex);

                conversation.hasUnread = computeConversationUnread(conversation);
                state.hasUnreadGlobal = computeHasUnreadGlobal(state.conversations);
                return sent;
            } catch {
                const conversation = ensureConversation(state.conversations, ownerPubkey, peerPubkey, options.storage);
                conversation.messages = conversation.messages.map((message) =>
                    message.clientMessageId === clientMessageId
                        ? {
                              ...message,
                              deliveryState: 'failed',
                          }
                        : message
                );
                return null;
            }
        },
    };
}

export function useDirectMessages(options: UseDirectMessagesOptions): DirectMessagesStore {
    const store = useMemo(
        () =>
            createDirectMessagesStore({
                ownerPubkey: options.ownerPubkey,
                dmService: options.dmService,
                storage: options.storage,
                now: options.now,
            }),
        [options.ownerPubkey, options.dmService, options.storage, options.now]
    );

    useEffect(() => {
        store.start();
        return () => {
            store.dispose();
        };
    }, [store]);

    return store;
}
