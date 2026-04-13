import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DmMessage, SentIndexItem } from '../../nostr/dm-service';
import { nostrOverlayQueryKeys } from './keys';
import {
    createDmReadStateStorage,
    fallbackStorage,
    normalizeToEpochSeconds,
    type DmReadStateStorage,
} from './dm-storage';

export interface DirectMessageItem extends DmMessage {
    isUndecryptable?: boolean;
}

export interface DirectMessageConversationState {
    id: string;
    messages: DirectMessageItem[];
    lastReadAt: number;
    hasUnread: boolean;
}

export interface DirectMessagesService {
    subscribeInbox: (input: { ownerPubkey: string }, onMessage: (message: DirectMessageItem) => void) => (() => void) | void;
    sendDm?: (input: {
        ownerPubkey: string;
        peerPubkey: string;
        plaintext: string;
        clientMessageId: string;
    }) => Promise<DirectMessageItem>;
    loadInitialConversations?: (input: { ownerPubkey: string; sentIndex?: SentIndexItem[] }) => Promise<DirectMessageItem[]>;
    loadConversationMessages?: (input: {
        ownerPubkey: string;
        peerPubkey: string;
        since?: number;
        sentIndex?: SentIndexItem[];
    }) => Promise<DirectMessageItem[]>;
}

interface UseDirectMessagesControllerOptions {
    ownerPubkey?: string;
    dmService: DirectMessagesService;
    storage?: DmReadStateStorage;
    now?: () => number;
}

function compareMessages(left: DirectMessageItem, right: DirectMessageItem): number {
    const leftTime = normalizeToEpochSeconds(left.createdAt);
    const rightTime = normalizeToEpochSeconds(right.createdAt);
    if (leftTime !== rightTime) {
        return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
}

function normalizeMessage(message: DirectMessageItem): DirectMessageItem {
    return {
        ...message,
        createdAt: normalizeToEpochSeconds(message.createdAt),
    };
}

function mergeMessages(existing: DirectMessageItem[], incoming: DirectMessageItem[]): DirectMessageItem[] {
    const byId = new Map<string, DirectMessageItem>();
    for (const message of existing) {
        byId.set(message.id, message);
    }

    for (const message of incoming) {
        byId.set(message.id, message);
    }

    return [...byId.values()].sort(compareMessages);
}

function computeConversationUnread(conversation: DirectMessageConversationState): boolean {
    return conversation.messages.some(
        (message) => message.direction === 'incoming' && normalizeToEpochSeconds(message.createdAt) > conversation.lastReadAt
    );
}

function buildClientMessageId(now: () => number): string {
    return `client-${now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function useDirectMessagesController(options: UseDirectMessagesControllerOptions) {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const [isListOpen, setIsListOpen] = useState(false);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [openedConversationIds, setOpenedConversationIds] = useState<string[]>([]);
    const [lastReadAtByConversation, setLastReadAtByConversation] = useState<Record<string, number>>({});
    const queryClient = useQueryClient();

    const storage = useMemo(() => {
        if (options.storage) {
            return options.storage;
        }

        const backingStorage = typeof window === 'undefined' ? fallbackStorage : window.localStorage;
        return createDmReadStateStorage({
            storage: backingStorage,
            now: () => Math.floor(Date.now() / 1000),
            version: 'v1',
        });
    }, [options.storage]);

    const listQueryKey = useMemo(
        () => nostrOverlayQueryKeys.directMessagesList({ ownerPubkey: options.ownerPubkey || '' }),
        [options.ownerPubkey]
    );

    const directMessagesListQuery = useQuery({
        queryKey: listQueryKey,
        queryFn: async (): Promise<DirectMessageItem[]> => {
            if (!options.ownerPubkey) {
                return [];
            }

            const sentIndex = storage.getSentIndex(options.ownerPubkey);
            const loaded = await options.dmService.loadInitialConversations?.({
                ownerPubkey: options.ownerPubkey,
                sentIndex,
            }) ?? [];
            return mergeMessages([], loaded.map(normalizeMessage));
        },
        enabled: Boolean(options.ownerPubkey),
    });

    useEffect(() => {
        setIsListOpen(false);
        setActiveConversationId(null);
        setOpenedConversationIds([]);
        setLastReadAtByConversation({});
    }, [options.ownerPubkey]);

    useEffect(() => {
        if (!options.ownerPubkey) {
            return;
        }

        return options.dmService.subscribeInbox({ ownerPubkey: options.ownerPubkey }, (message) => {
            queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) =>
                mergeMessages(current, [normalizeMessage(message)])
            );
        });
    }, [options.dmService, options.ownerPubkey, queryClient, listQueryKey]);

    const activeConversationBackfillQuery = useQuery({
        queryKey: nostrOverlayQueryKeys.directMessagesConversation({
            ownerPubkey: options.ownerPubkey || '',
            conversationId: activeConversationId || '__none__',
        }),
        queryFn: async (): Promise<DirectMessageItem[]> => {
            if (!options.ownerPubkey || !activeConversationId) {
                return [];
            }

            const currentMessages = queryClient.getQueryData<DirectMessageItem[]>(listQueryKey) ?? [];
            const currentConversationMessages = currentMessages.filter((message) => message.conversationId === activeConversationId);
            const oldestCreatedAt = currentConversationMessages.length > 0
                ? normalizeToEpochSeconds(currentConversationMessages[0].createdAt)
                : 0;
            const sentIndex = storage.getSentIndex(options.ownerPubkey);

            const loaded = await options.dmService.loadConversationMessages?.({
                ownerPubkey: options.ownerPubkey,
                peerPubkey: activeConversationId,
                since: oldestCreatedAt > 0 ? Math.max(0, oldestCreatedAt - 1) : 0,
                sentIndex,
            }) ?? [];
            return mergeMessages([], loaded.map(normalizeMessage));
        },
        enabled: Boolean(options.ownerPubkey && activeConversationId && options.dmService.loadConversationMessages),
    });

    useEffect(() => {
        if (!activeConversationBackfillQuery.data || activeConversationBackfillQuery.data.length === 0) {
            return;
        }

        queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) =>
            mergeMessages(current, activeConversationBackfillQuery.data || [])
        );
    }, [activeConversationBackfillQuery.data, queryClient, listQueryKey]);

    const allMessages = directMessagesListQuery.data ?? [];

    const markConversationRead = useCallback((conversationId: string, timestampSec?: number) => {
        if (!options.ownerPubkey) {
            return;
        }

        const conversationMessages = allMessages.filter((message) => message.conversationId === conversationId);
        const maxVisibleCreatedAt = conversationMessages.reduce(
            (maxValue, message) => Math.max(maxValue, normalizeToEpochSeconds(message.createdAt)),
            0
        );

        setLastReadAtByConversation((current) => {
            const currentValue = current[conversationId] ?? storage.getLastReadAt(options.ownerPubkey!, conversationId);
            const nextValue = Math.max(currentValue, timestampSec ?? maxVisibleCreatedAt);
            if (nextValue === currentValue) {
                return current;
            }

            storage.setLastReadAt(options.ownerPubkey!, conversationId, nextValue);
            return {
                ...current,
                [conversationId]: nextValue,
            };
        });
    }, [allMessages, options.ownerPubkey, storage]);

    useEffect(() => {
        if (!activeConversationId) {
            return;
        }

        markConversationRead(activeConversationId);
    }, [activeConversationId, allMessages, markConversationRead]);

    const sendDmMutation = useMutation({
        mutationKey: ['nostr-overlay', 'social', 'direct-messages', 'send-dm'] as const,
        mutationFn: async (input: {
            ownerPubkey: string;
            peerPubkey: string;
            plaintext: string;
            clientMessageId: string;
        }) => {
            if (!options.dmService.sendDm) {
                throw new Error('No DM send service available');
            }

            return options.dmService.sendDm(input);
        },
        onMutate: async (input) => {
            const optimisticMessage: DirectMessageItem = {
                id: `client:${input.clientMessageId}`,
                clientMessageId: input.clientMessageId,
                conversationId: input.peerPubkey,
                peerPubkey: input.peerPubkey,
                direction: 'outgoing',
                createdAt: normalizeToEpochSeconds(now()),
                plaintext: input.plaintext,
                deliveryState: 'pending',
            };

            setOpenedConversationIds((current) => (current.includes(input.peerPubkey) ? current : [...current, input.peerPubkey]));

            queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) =>
                mergeMessages(current, [optimisticMessage])
            );

            return {
                optimisticId: optimisticMessage.id,
                conversationId: input.peerPubkey,
                clientMessageId: input.clientMessageId,
            };
        },
        onSuccess: (result, _input, context) => {
            const normalized = normalizeMessage(result);
            queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) => {
                const filtered = current.filter((message) => message.id !== context.optimisticId);
                return mergeMessages(filtered, [normalized]);
            });

            if (options.ownerPubkey) {
                const sentIndex = storage.getSentIndex(options.ownerPubkey);
                const nextIndex: SentIndexItem = {
                    clientMessageId: normalized.clientMessageId || context.clientMessageId,
                    conversationId: normalized.conversationId,
                    rumorEventId: normalized.rumorEventId,
                    sealEventId: normalized.sealEventId,
                    giftWrapEventId: normalized.giftWrapEventId,
                    createdAtSec: normalizeToEpochSeconds(normalized.createdAt),
                    deliveryState: normalized.deliveryState,
                    targetRelays: [],
                    plaintext: normalized.plaintext,
                };
                storage.setSentIndex(options.ownerPubkey, [nextIndex, ...sentIndex]);
            }
        },
        onError: (_error, _input, context) => {
            queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) =>
                current.map((message) => {
                    if (message.id !== context.optimisticId) {
                        return message;
                    }

                    return {
                        ...message,
                        deliveryState: 'failed',
                    };
                })
            );
        },
    });

    const conversations = useMemo<Record<string, DirectMessageConversationState>>(() => {
        const grouped: Record<string, DirectMessageConversationState> = {};

        for (const message of allMessages) {
            const currentConversation = grouped[message.conversationId] || {
                id: message.conversationId,
                messages: [],
                lastReadAt: options.ownerPubkey
                    ? lastReadAtByConversation[message.conversationId] ?? storage.getLastReadAt(options.ownerPubkey, message.conversationId)
                    : 0,
                hasUnread: false,
            };

            currentConversation.messages.push(message);
            grouped[message.conversationId] = currentConversation;
        }

        for (const conversationId of openedConversationIds) {
            if (grouped[conversationId]) {
                continue;
            }

            grouped[conversationId] = {
                id: conversationId,
                messages: [],
                lastReadAt: options.ownerPubkey
                    ? lastReadAtByConversation[conversationId] ?? storage.getLastReadAt(options.ownerPubkey, conversationId)
                    : 0,
                hasUnread: false,
            };
        }

        for (const conversation of Object.values(grouped)) {
            conversation.messages.sort(compareMessages);
            conversation.hasUnread = computeConversationUnread(conversation);
        }

        return grouped;
    }, [allMessages, lastReadAtByConversation, openedConversationIds, options.ownerPubkey, storage]);

    const hasUnreadGlobal = useMemo(
        () => Object.values(conversations).some((conversation) => conversation.hasUnread),
        [conversations]
    );

    const openList = useCallback(() => {
        setIsListOpen(true);
        setActiveConversationId(null);
    }, []);

    const openConversation = useCallback((conversationId: string) => {
        if (!conversationId) {
            return;
        }

        setOpenedConversationIds((current) => (current.includes(conversationId) ? current : [...current, conversationId]));
        setIsListOpen(false);
        setActiveConversationId(conversationId);
        markConversationRead(conversationId);
    }, [markConversationRead]);

    const sendMessage = useCallback(async (peerPubkey: string, plaintext: string): Promise<DirectMessageItem | null> => {
        if (!options.ownerPubkey || !peerPubkey || !options.dmService.sendDm) {
            return null;
        }

        const normalizedPlaintext = plaintext.trim();
        if (!normalizedPlaintext) {
            return null;
        }

        try {
            const sent = await sendDmMutation.mutateAsync({
                ownerPubkey: options.ownerPubkey,
                peerPubkey,
                plaintext: normalizedPlaintext,
                clientMessageId: buildClientMessageId(now),
            });
            return normalizeMessage(sent);
        } catch {
            return null;
        }
    }, [now, options.dmService.sendDm, options.ownerPubkey, sendDmMutation]);

    return {
        isListOpen,
        activeConversationId,
        conversations,
        hasUnreadGlobal,
        isBootstrapping: directMessagesListQuery.isPending,
        bootstrapError: directMessagesListQuery.error instanceof Error
            ? directMessagesListQuery.error.message
            : directMessagesListQuery.error
                ? 'No se pudieron cargar las conversaciones'
                : null,
        openList,
        openConversation,
        markConversationRead,
        sendMessage,
        isSendingMessage: sendDmMutation.isPending,
    };
}
