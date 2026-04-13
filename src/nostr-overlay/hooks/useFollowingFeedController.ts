import { useCallback, useEffect, useMemo, useState } from 'react';
import { type InfiniteData, useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import type {
    SocialEngagementByEventId,
    SocialEngagementMetrics,
    SocialFeedPage,
    SocialFeedService,
    SocialThreadPage,
} from '../../nostr/social-feed-service';
import {
    buildPendingByEventId,
    buildReplyTags,
    buildTemporaryFeedNote,
    buildTemporaryThreadReply,
    followingFeedMutationKeys,
    prependFeedItem,
    prependReply,
    sanitizeContent,
    toFeedItemFromPublished,
    toThreadItemFromPublished,
    type PublishReplyInput,
    type ToggleReactionInput,
    type ToggleRepostInput,
    type WriteGatewayLike,
} from '../query/following-feed.mutations';
import { nostrOverlayQueryKeys } from '../query/keys';
import {
    applyEngagementDeltas,
    collectEngagementEventIds,
    createEmptyEngagementByEventIds,
    mergeFeedItems,
    mergeThreadReplies,
    normalizeEventIds,
    selectFeedItemsFromPages,
    selectThreadViewFromPages,
    type FollowingFeedThreadView,
} from '../query/following-feed.selectors';
import {
    useFollowingFeedEngagementQuery,
    useFollowingFeedInfiniteQuery,
    useThreadInfiniteQuery,
} from '../query/following-feed.query';
import {
    createFollowingFeedReadStateStorage,
    fallbackStorage,
    normalizeToEpochSeconds,
    type FollowingFeedReadStateStorage,
} from '../query/following-feed-read-state';

interface UseFollowingFeedControllerOptions {
    ownerPubkey?: string;
    follows: string[];
    canWrite: boolean;
    service: SocialFeedService;
    storage?: FollowingFeedReadStateStorage;
    writeGateway?: WriteGatewayLike;
    now?: () => number;
    pageSize?: number;
    threadPageSize?: number;
}

interface ToggleReactionMutationVariables {
    input: ToggleReactionInput;
    previous: boolean;
    next: boolean;
    reactionEventId?: string;
}

interface ToggleRepostMutationVariables {
    input: ToggleRepostInput;
    previous: boolean;
    next: boolean;
    repostEventId?: string;
}

interface PublishPostMutationVariables {
    content: string;
}

interface PublishReplyMutationVariables {
    input: PublishReplyInput;
    rootEventId: string;
    content: string;
}

const EMPTY_ENGAGEMENT_METRICS: SocialEngagementMetrics = {
    replies: 0,
    reposts: 0,
    reactions: 0,
    zaps: 0,
};

export function useFollowingFeedController(options: UseFollowingFeedControllerOptions) {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const queryClient = useQueryClient();
    const storage = useMemo(() => {
        if (options.storage) {
            return options.storage;
        }

        const backingStorage = typeof window === 'undefined' ? fallbackStorage : window.localStorage;
        return createFollowingFeedReadStateStorage({
            storage: backingStorage,
            version: 'v1',
        });
    }, [options.storage]);
    const [isOpen, setIsOpen] = useState(false);
    const [lastReadAt, setLastReadAt] = useState(() =>
        options.ownerPubkey ? storage.getLastReadAt(options.ownerPubkey) : 0
    );
    const [activeThreadRootEventId, setActiveThreadRootEventId] = useState<string | null>(null);
    const [publishError, setPublishError] = useState<string | null>(null);
    const [reactionByEventId, setReactionByEventId] = useState<Record<string, boolean>>({});
    const [repostByEventId, setRepostByEventId] = useState<Record<string, boolean>>({});
    const [reactionEventIdByTarget, setReactionEventIdByTarget] = useState<Record<string, string>>({});
    const [repostEventIdByTarget, setRepostEventIdByTarget] = useState<Record<string, string>>({});
    const [engagementDeltaByEventId, setEngagementDeltaByEventId] = useState<SocialEngagementByEventId>({});

    const follows = useMemo(() => normalizeEventIds(options.follows), [options.follows]);
    const feedPageSize = Math.max(1, options.pageSize ?? 20);
    const threadPageSize = Math.max(1, options.threadPageSize ?? 25);

    const feedQueryKey = useMemo(() => nostrOverlayQueryKeys.followingFeed({
        ownerPubkey: options.ownerPubkey,
        follows,
        pageSize: feedPageSize,
    }), [feedPageSize, follows, options.ownerPubkey]);

    const feedQuery = useFollowingFeedInfiniteQuery({
        ownerPubkey: options.ownerPubkey,
        follows,
        service: options.service,
        enabled: Boolean(options.ownerPubkey),
        pageSize: feedPageSize,
    });

    useEffect(() => {
        if (!options.ownerPubkey) {
            setIsOpen(false);
            setLastReadAt(0);
            return;
        }

        setLastReadAt(storage.getLastReadAt(options.ownerPubkey));
    }, [options.ownerPubkey, storage]);

    const threadQuery = useThreadInfiniteQuery({
        rootEventId: activeThreadRootEventId,
        service: options.service,
        enabled: isOpen && Boolean(activeThreadRootEventId),
        pageSize: threadPageSize,
    });

    const items = useMemo(
        () => selectFeedItemsFromPages(feedQuery.data?.pages),
        [feedQuery.data?.pages]
    );

    const activeThread = useMemo(() => {
        if (!activeThreadRootEventId) {
            return null;
        }

        return selectThreadViewFromPages({
            rootEventId: activeThreadRootEventId,
            pages: threadQuery.data?.pages,
            isLoading: threadQuery.isPending,
            isLoadingMore: threadQuery.isFetchingNextPage,
            error: threadQuery.error?.message ?? null,
            hasMore: Boolean(threadQuery.hasNextPage),
        });
    }, [
        activeThreadRootEventId,
        threadQuery.data?.pages,
        threadQuery.error?.message,
        threadQuery.hasNextPage,
        threadQuery.isFetchingNextPage,
        threadQuery.isPending,
    ]);

    const engagementEventIds = useMemo(() => collectEngagementEventIds({
        items,
        activeThread,
    }), [activeThread, items]);

    const engagementQuery = useFollowingFeedEngagementQuery({
        eventIds: engagementEventIds,
        service: options.service,
        enabled: isOpen,
    });

    const baseEngagementByEventId = useMemo(() => {
        const fallback = createEmptyEngagementByEventIds(engagementEventIds);
        if (!engagementQuery.data) {
            return fallback;
        }

        return {
            ...fallback,
            ...engagementQuery.data,
        };
    }, [engagementEventIds, engagementQuery.data]);

    const engagementByEventId = useMemo(() => applyEngagementDeltas({
        eventIds: engagementEventIds,
        baseByEventId: baseEngagementByEventId,
        deltaByEventId: engagementDeltaByEventId,
    }), [baseEngagementByEventId, engagementDeltaByEventId, engagementEventIds]);

    const applyEngagementDelta = useCallback((eventId: string, key: keyof SocialEngagementMetrics, delta: number) => {
        if (!eventId || !Number.isFinite(delta) || delta === 0) {
            return;
        }

        setEngagementDeltaByEventId((current) => {
            const currentValue = current[eventId] ?? EMPTY_ENGAGEMENT_METRICS;
            return {
                ...current,
                [eventId]: {
                    ...currentValue,
                    [key]: (currentValue[key] || 0) + delta,
                },
            };
        });
    }, []);

    const publishPostMutation = useMutation({
        mutationKey: followingFeedMutationKeys.publishPost,
        mutationFn: async (variables: PublishPostMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            return options.writeGateway.publishTextNote(variables.content, []);
        },
        onMutate: async (variables) => {
            if (!options.ownerPubkey) {
                return { tempId: '' };
            }

            setPublishError(null);
            const tempId = `temp-post:${Date.now()}`;
            const tempNote = buildTemporaryFeedNote(tempId, options.ownerPubkey, now(), variables.content);

            queryClient.setQueryData<InfiniteData<SocialFeedPage>>(feedQueryKey, (current) =>
                prependFeedItem(current, tempNote)
            );

            return { tempId };
        },
        onSuccess: (published, _variables, context) => {
            queryClient.setQueryData<InfiniteData<SocialFeedPage>>(feedQueryKey, (current) => {
                if (!current || current.pages.length === 0) {
                    return current;
                }

                const publishedItem = toFeedItemFromPublished(published);
                const firstPage = current.pages[0];
                const withoutTemp = firstPage.items.filter((item) => item.id !== context.tempId);
                const updatedItems = publishedItem ? mergeFeedItems([publishedItem], withoutTemp) : withoutTemp;
                return {
                    pages: [{ ...firstPage, items: updatedItems }, ...current.pages.slice(1)],
                    pageParams: current.pageParams,
                };
            });
        },
        onError: (error, _variables, context) => {
            queryClient.setQueryData<InfiniteData<SocialFeedPage>>(feedQueryKey, (current) => {
                if (!current || current.pages.length === 0) {
                    return current;
                }

                const firstPage = current.pages[0];
                return {
                    pages: [{ ...firstPage, items: firstPage.items.filter((item) => item.id !== context.tempId) }, ...current.pages.slice(1)],
                    pageParams: current.pageParams,
                };
            });
            setPublishError(error instanceof Error ? error.message : 'No se pudo publicar la nota');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        },
    });

    const publishReplyMutation = useMutation({
        mutationKey: followingFeedMutationKeys.publishReply,
        mutationFn: async (variables: PublishReplyMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            const tags = buildReplyTags(variables.input, activeThread);
            return options.writeGateway.publishTextNote(variables.content, tags);
        },
        onMutate: async (variables) => {
            if (!options.ownerPubkey) {
                return { tempId: '' };
            }

            setPublishError(null);
            const tempId = `temp-reply:${Date.now()}`;
            const tempReply = buildTemporaryThreadReply(
                tempId,
                options.ownerPubkey,
                now(),
                variables.content,
                variables.input.targetEventId
            );
            applyEngagementDelta(variables.input.targetEventId, 'replies', 1);

            const threadKey = nostrOverlayQueryKeys.thread({
                rootEventId: variables.rootEventId,
                pageSize: threadPageSize,
            });

            queryClient.setQueryData<InfiniteData<SocialThreadPage>>(threadKey, (current) => prependReply(current, tempReply));
            return { tempId, targetEventId: variables.input.targetEventId, threadKey };
        },
        onSuccess: (published, _variables, context) => {
            queryClient.setQueryData<InfiniteData<SocialThreadPage>>(context.threadKey, (current) => {
                if (!current || current.pages.length === 0) {
                    return current;
                }

                const publishedReply = toThreadItemFromPublished(published);
                const firstPage = current.pages[0];
                const withoutTemp = firstPage.replies.filter((reply) => reply.id !== context.tempId);
                const updatedReplies = mergeThreadReplies([publishedReply], withoutTemp);
                return {
                    pages: [{ ...firstPage, replies: updatedReplies }, ...current.pages.slice(1)],
                    pageParams: current.pageParams,
                };
            });
        },
        onError: (error, _variables, context) => {
            applyEngagementDelta(context.targetEventId, 'replies', -1);
            queryClient.setQueryData<InfiniteData<SocialThreadPage>>(context.threadKey, (current) => {
                if (!current || current.pages.length === 0) {
                    return current;
                }

                const firstPage = current.pages[0];
                return {
                    pages: [{ ...firstPage, replies: firstPage.replies.filter((reply) => reply.id !== context.tempId) }, ...current.pages.slice(1)],
                    pageParams: current.pageParams,
                };
            });
            setPublishError(error instanceof Error ? error.message : 'No se pudo publicar la respuesta');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        },
    });

    const toggleReactionMutation = useMutation({
        mutationKey: followingFeedMutationKeys.toggleReaction,
        mutationFn: async (variables: ToggleReactionMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            if (variables.next) {
                const tags = variables.input.targetPubkey
                    ? [['e', variables.input.eventId], ['p', variables.input.targetPubkey]]
                    : [['e', variables.input.eventId]];
                const published = await options.writeGateway.publishEvent({
                    kind: 7,
                    content: variables.input.emoji && variables.input.emoji.length > 0 ? variables.input.emoji : '+',
                    created_at: now(),
                    tags,
                });
                return { publishedReactionEventId: published.id };
            }

            if (!variables.reactionEventId) {
                throw new Error('No hay reaccion local para eliminar');
            }

            await options.writeGateway.publishEvent({
                kind: 5,
                content: '',
                created_at: now(),
                tags: [['e', variables.reactionEventId]],
            });

            return {};
        },
        onMutate: async (variables) => {
            const eventId = variables.input.eventId;
            const optimisticDelta = variables.next ? 1 : -1;
            setPublishError(null);
            setReactionByEventId((current) => ({ ...current, [eventId]: variables.next }));
            applyEngagementDelta(eventId, 'reactions', optimisticDelta);
            return { eventId, optimisticDelta };
        },
        onSuccess: (result, variables) => {
            const eventId = variables.input.eventId;
            if (variables.next && result.publishedReactionEventId) {
                setReactionEventIdByTarget((current) => ({
                    ...current,
                    [eventId]: result.publishedReactionEventId,
                }));
                return;
            }

            if (!variables.next) {
                setReactionEventIdByTarget((current) => {
                    const next = { ...current };
                    delete next[eventId];
                    return next;
                });
            }
        },
        onError: (error, variables, context) => {
            setReactionByEventId((current) => ({ ...current, [variables.input.eventId]: variables.previous }));
            applyEngagementDelta(context.eventId, 'reactions', -context.optimisticDelta);
            setPublishError(error instanceof Error ? error.message : 'No se pudo actualizar la reaccion');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        },
    });

    const toggleRepostMutation = useMutation({
        mutationKey: followingFeedMutationKeys.toggleRepost,
        mutationFn: async (variables: ToggleRepostMutationVariables) => {
            if (!options.writeGateway) {
                throw new Error('No write gateway available');
            }

            if (variables.next) {
                const tags = variables.input.targetPubkey
                    ? [['e', variables.input.eventId], ['p', variables.input.targetPubkey]]
                    : [['e', variables.input.eventId]];
                const published = await options.writeGateway.publishEvent({
                    kind: 6,
                    content: variables.input.repostContent ?? '',
                    created_at: now(),
                    tags,
                });
                return { publishedRepostEventId: published.id };
            }

            if (!variables.repostEventId) {
                throw new Error('No hay repost local para eliminar');
            }

            await options.writeGateway.publishEvent({
                kind: 5,
                content: '',
                created_at: now(),
                tags: [['e', variables.repostEventId]],
            });

            return {};
        },
        onMutate: async (variables) => {
            const eventId = variables.input.eventId;
            const optimisticDelta = variables.next ? 1 : -1;
            setPublishError(null);
            setRepostByEventId((current) => ({ ...current, [eventId]: variables.next }));
            applyEngagementDelta(eventId, 'reposts', optimisticDelta);
            return { eventId, optimisticDelta };
        },
        onSuccess: (result, variables) => {
            const eventId = variables.input.eventId;
            if (variables.next && result.publishedRepostEventId) {
                setRepostEventIdByTarget((current) => ({
                    ...current,
                    [eventId]: result.publishedRepostEventId,
                }));
                return;
            }

            if (!variables.next) {
                setRepostEventIdByTarget((current) => {
                    const next = { ...current };
                    delete next[eventId];
                    return next;
                });
            }
        },
        onError: (error, variables, context) => {
            setRepostByEventId((current) => ({ ...current, [variables.input.eventId]: variables.previous }));
            applyEngagementDelta(context.eventId, 'reposts', -context.optimisticDelta);
            setPublishError(error instanceof Error ? error.message : 'No se pudo actualizar el repost');
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() });
        },
    });

    const pendingReactionEventIds = useMutationState<string>({
        filters: {
            mutationKey: followingFeedMutationKeys.toggleReaction,
            status: 'pending',
        },
        select: (mutation) => {
            const variables = mutation.state.variables as ToggleReactionMutationVariables | undefined;
            return variables?.input.eventId || '';
        },
    });

    const pendingRepostEventIds = useMutationState<string>({
        filters: {
            mutationKey: followingFeedMutationKeys.toggleRepost,
            status: 'pending',
        },
        select: (mutation) => {
            const variables = mutation.state.variables as ToggleRepostMutationVariables | undefined;
            return variables?.input.eventId || '';
        },
    });

    const pendingReactionByEventId = useMemo(
        () => buildPendingByEventId(pendingReactionEventIds),
        [pendingReactionEventIds]
    );

    const pendingRepostByEventId = useMemo(
        () => buildPendingByEventId(pendingRepostEventIds),
        [pendingRepostEventIds]
    );

    const hasUnread = useMemo(
        () => items.some((item) => normalizeToEpochSeconds(item.createdAt) > lastReadAt),
        [items, lastReadAt]
    );

    const open = useCallback(() => {
        setIsOpen(true);

        if (!options.ownerPubkey) {
            return;
        }

        const maxVisibleCreatedAt = items.reduce(
            (maxValue, item) => Math.max(maxValue, normalizeToEpochSeconds(item.createdAt)),
            0
        );
        const nextLastReadAt = Math.max(lastReadAt, maxVisibleCreatedAt, normalizeToEpochSeconds(now()));
        setLastReadAt(nextLastReadAt);
        storage.setLastReadAt(options.ownerPubkey, nextLastReadAt);
    }, [items, lastReadAt, now, options.ownerPubkey, storage]);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    const loadNextFeedPage = useCallback(async () => {
        if (!feedQuery.hasNextPage || feedQuery.isFetchingNextPage) {
            return;
        }

        await feedQuery.fetchNextPage();
    }, [feedQuery]);

    const openThread = useCallback((rootEventId: string) => {
        if (!rootEventId) {
            return;
        }

        setActiveThreadRootEventId(rootEventId);
    }, []);

    const closeThread = useCallback(() => {
        setActiveThreadRootEventId(null);
    }, []);

    const loadNextThreadPage = useCallback(async () => {
        if (!activeThreadRootEventId || !threadQuery.hasNextPage || threadQuery.isFetchingNextPage) {
            return;
        }

        await threadQuery.fetchNextPage();
    }, [activeThreadRootEventId, threadQuery]);

    const publishPost = useCallback(async (content: string): Promise<boolean> => {
        const normalized = sanitizeContent(content);
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || normalized.length === 0) {
            return false;
        }

        try {
            await publishPostMutation.mutateAsync({ content: normalized });
            return true;
        } catch {
            return false;
        }
    }, [options.canWrite, options.ownerPubkey, options.writeGateway, publishPostMutation]);

    const publishReply = useCallback(async (input: PublishReplyInput): Promise<boolean> => {
        const normalized = sanitizeContent(input.content);
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || normalized.length === 0 || !activeThreadRootEventId) {
            return false;
        }

        try {
            await publishReplyMutation.mutateAsync({
                input,
                rootEventId: activeThreadRootEventId,
                content: normalized,
            });
            return true;
        } catch {
            return false;
        }
    }, [activeThreadRootEventId, options.canWrite, options.ownerPubkey, options.writeGateway, publishReplyMutation]);

    const toggleReaction = useCallback(async (input: ToggleReactionInput): Promise<boolean> => {
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || !input.eventId) {
            return false;
        }

        const previous = Boolean(reactionByEventId[input.eventId]);
        const next = !previous;

        try {
            await toggleReactionMutation.mutateAsync({
                input,
                previous,
                next,
                reactionEventId: reactionEventIdByTarget[input.eventId],
            });
            return true;
        } catch {
            return false;
        }
    }, [
        options.canWrite,
        options.ownerPubkey,
        options.writeGateway,
        reactionByEventId,
        reactionEventIdByTarget,
        toggleReactionMutation,
    ]);

    const toggleRepost = useCallback(async (input: ToggleRepostInput): Promise<boolean> => {
        if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || !input.eventId) {
            return false;
        }

        const previous = Boolean(repostByEventId[input.eventId]);
        const next = !previous;

        try {
            await toggleRepostMutation.mutateAsync({
                input,
                previous,
                next,
                repostEventId: repostEventIdByTarget[input.eventId],
            });
            return true;
        } catch {
            return false;
        }
    }, [
        options.canWrite,
        options.ownerPubkey,
        options.writeGateway,
        repostByEventId,
        repostEventIdByTarget,
        toggleRepostMutation,
    ]);

    return {
        isOpen,
        items,
        hasUnread,
        isLoadingFeed: feedQuery.isPending || feedQuery.isFetchingNextPage,
        feedError: feedQuery.error?.message ?? null,
        hasMoreFeed: Boolean(feedQuery.hasNextPage),
        activeThread,
        publishError,
        isPublishingPost: publishPostMutation.isPending,
        isPublishingReply: publishReplyMutation.isPending,
        reactionByEventId,
        repostByEventId,
        pendingReactionByEventId,
        pendingRepostByEventId,
        engagementByEventId,
        open,
        close,
        loadNextFeedPage,
        openThread,
        closeThread,
        loadNextThreadPage,
        publishPost,
        publishReply,
        toggleReaction,
        toggleRepost,
    };
}
