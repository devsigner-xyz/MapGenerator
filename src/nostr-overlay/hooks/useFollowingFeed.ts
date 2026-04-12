import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type {
    LoadFollowingFeedInput,
    LoadThreadInput,
    SocialFeedItem,
    SocialFeedPage,
    SocialThreadItem,
    SocialThreadPage,
} from '../../nostr/social-feed-service';

interface FollowingFeedService {
    loadFollowingFeed(input: LoadFollowingFeedInput): Promise<SocialFeedPage>;
    loadThread(input: LoadThreadInput): Promise<SocialThreadPage>;
}

interface PublishEventInput {
    kind: number;
    content: string;
    created_at: number;
    tags: string[][];
}

interface PublishEventResult {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
}

interface WriteGatewayLike {
    publishEvent(event: PublishEventInput): Promise<PublishEventResult>;
    publishTextNote(content: string, tags?: string[][]): Promise<PublishEventResult>;
}

interface ToggleReactionInput {
    eventId: string;
    targetPubkey?: string;
    emoji?: string;
}

interface ToggleRepostInput {
    eventId: string;
    targetPubkey?: string;
    repostContent?: string;
}

interface PublishReplyInput {
    targetEventId: string;
    targetPubkey?: string;
    rootEventId?: string;
    content: string;
}

interface UseFollowingFeedOptions {
    ownerPubkey?: string;
    follows: string[];
    canWrite: boolean;
    service: FollowingFeedService;
    writeGateway?: WriteGatewayLike;
    now?: () => number;
    pageSize?: number;
    threadPageSize?: number;
}

interface FollowingFeedThreadState {
    rootEventId: string;
    root: SocialThreadItem | null;
    replies: SocialThreadItem[];
    isLoading: boolean;
    isLoadingMore: boolean;
    error: string | null;
    hasMore: boolean;
    cursor?: number;
}

interface FollowingFeedState {
    isDialogOpen: boolean;
    items: SocialFeedItem[];
    isLoadingFeed: boolean;
    feedError: string | null;
    hasMoreFeed: boolean;
    feedCursor?: number;
    activeThread: FollowingFeedThreadState | null;
    publishError: string | null;
    isPublishingPost: boolean;
    isPublishingReply: boolean;
    reactionByEventId: Record<string, boolean>;
    repostByEventId: Record<string, boolean>;
    reactionEventIdByTarget: Record<string, string>;
    repostEventIdByTarget: Record<string, string>;
    pendingReactionByEventId: Record<string, boolean>;
    pendingRepostByEventId: Record<string, boolean>;
}

export interface FollowingFeedStore {
    getState(): FollowingFeedState;
    getVersion(): number;
    subscribe(listener: () => void): () => void;
    openDialog(): Promise<void>;
    closeDialog(): void;
    loadNextFeedPage(): Promise<void>;
    openThread(rootEventId: string): Promise<void>;
    closeThread(): void;
    loadNextThreadPage(): Promise<void>;
    publishPost(content: string): Promise<boolean>;
    publishReply(input: PublishReplyInput): Promise<boolean>;
    toggleReaction(input: ToggleReactionInput): Promise<boolean>;
    toggleRepost(input: ToggleRepostInput): Promise<boolean>;
    dispose(): void;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_THREAD_PAGE_SIZE = 25;

function sanitizeContent(content: string): string {
    return content.replace(/\s+/g, ' ').trim();
}

function sortFeedItems(items: SocialFeedItem[]): SocialFeedItem[] {
    return [...items].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return right.createdAt - left.createdAt;
        }

        return left.id.localeCompare(right.id);
    });
}

function sortThreadItems(items: SocialThreadItem[]): SocialThreadItem[] {
    return [...items].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return right.createdAt - left.createdAt;
        }

        return left.id.localeCompare(right.id);
    });
}

function mergeFeedItems(existing: SocialFeedItem[], incoming: SocialFeedItem[]): SocialFeedItem[] {
    const byId = new Map<string, SocialFeedItem>();
    for (const item of existing) {
        byId.set(item.id, item);
    }
    for (const item of incoming) {
        byId.set(item.id, item);
    }

    return sortFeedItems([...byId.values()]);
}

function mergeThreadReplies(existing: SocialThreadItem[], incoming: SocialThreadItem[]): SocialThreadItem[] {
    const byId = new Map<string, SocialThreadItem>();
    for (const item of existing) {
        byId.set(item.id, item);
    }
    for (const item of incoming) {
        byId.set(item.id, item);
    }

    return sortThreadItems([...byId.values()]);
}

function buildReplyTags(input: PublishReplyInput, activeThread: FollowingFeedThreadState | null): string[][] {
    const rootEventId = input.rootEventId || activeThread?.root?.id || input.targetEventId;
    const tags: string[][] = [
        ['e', rootEventId, '', 'root'],
        ['e', input.targetEventId, '', 'reply'],
    ];

    if (input.targetPubkey) {
        tags.push(['p', input.targetPubkey]);
    }

    return tags;
}

function buildTemporaryFeedNote(id: string, pubkey: string, createdAt: number, content: string): SocialFeedItem {
    return {
        id,
        pubkey,
        createdAt,
        content,
        kind: 'note',
        rawEvent: {
            id,
            pubkey,
            kind: 1,
            created_at: createdAt,
            tags: [],
            content,
        },
    };
}

function buildTemporaryThreadReply(id: string, pubkey: string, createdAt: number, content: string, targetEventId: string): SocialThreadItem {
    return {
        id,
        pubkey,
        createdAt,
        eventKind: 1,
        content,
        targetEventId,
        rawEvent: {
            id,
            pubkey,
            kind: 1,
            created_at: createdAt,
            tags: [['e', targetEventId, '', 'reply']],
            content,
        },
    };
}

function toFeedItemFromPublished(event: PublishEventResult): SocialFeedItem | null {
    if (event.kind !== 1 && event.kind !== 6 && event.kind !== 16) {
        return null;
    }

    return {
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        content: event.content,
        kind: event.kind === 1 ? 'note' : 'repost',
        targetEventId: event.tags.find((tag) => tag[0] === 'e')?.[1],
        rawEvent: {
            ...event,
        },
    };
}

function toThreadItemFromPublished(event: PublishEventResult): SocialThreadItem {
    return {
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        eventKind: event.kind,
        content: event.content,
        targetEventId: event.tags.find((tag) => tag[0] === 'e')?.[1],
        rawEvent: {
            ...event,
        },
    };
}

export function createFollowingFeedStore(options: UseFollowingFeedOptions): FollowingFeedStore {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const pageSize = Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE);
    const threadPageSize = Math.max(1, options.threadPageSize ?? DEFAULT_THREAD_PAGE_SIZE);
    const follows = [...new Set(options.follows.filter((pubkey) => typeof pubkey === 'string' && pubkey.length > 0))];

    const state: FollowingFeedState = {
        isDialogOpen: false,
        items: [],
        isLoadingFeed: false,
        feedError: null,
        hasMoreFeed: follows.length > 0,
        feedCursor: undefined,
        activeThread: null,
        publishError: null,
        isPublishingPost: false,
        isPublishingReply: false,
        reactionByEventId: {},
        repostByEventId: {},
        reactionEventIdByTarget: {},
        repostEventIdByTarget: {},
        pendingReactionByEventId: {},
        pendingRepostByEventId: {},
    };
    const listeners = new Set<() => void>();
    let version = 0;
    let disposed = false;

    const emitChange = (): void => {
        version += 1;
        for (const listener of listeners) {
            listener();
        }
    };

    const loadFeed = async (): Promise<void> => {
        if (disposed || state.isLoadingFeed || !state.hasMoreFeed || follows.length === 0) {
            if (follows.length === 0 && state.hasMoreFeed) {
                state.hasMoreFeed = false;
                emitChange();
            }
            return;
        }

        state.isLoadingFeed = true;
        state.feedError = null;
        emitChange();

        try {
            const page = await options.service.loadFollowingFeed({
                follows,
                limit: pageSize,
                until: state.feedCursor,
            });

            state.items = mergeFeedItems(state.items, page.items);
            state.hasMoreFeed = page.hasMore;
            state.feedCursor = page.nextUntil;
            state.isLoadingFeed = false;
            state.feedError = null;
            emitChange();
        } catch (error) {
            state.isLoadingFeed = false;
            state.feedError = error instanceof Error ? error.message : 'No se pudo cargar el feed';
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

        async openDialog() {
            state.isDialogOpen = true;
            emitChange();

            if (state.items.length === 0) {
                await loadFeed();
            }
        },

        closeDialog() {
            state.isDialogOpen = false;
            emitChange();
        },

        async loadNextFeedPage() {
            await loadFeed();
        },

        async openThread(rootEventId) {
            if (!rootEventId || disposed) {
                return;
            }

            state.activeThread = {
                rootEventId,
                root: null,
                replies: [],
                isLoading: true,
                isLoadingMore: false,
                error: null,
                hasMore: true,
                cursor: undefined,
            };
            emitChange();

            try {
                const page = await options.service.loadThread({
                    rootEventId,
                    limit: threadPageSize,
                });

                if (!state.activeThread || state.activeThread.rootEventId !== rootEventId) {
                    return;
                }

                state.activeThread.root = page.root;
                state.activeThread.replies = sortThreadItems(page.replies);
                state.activeThread.hasMore = page.hasMore;
                state.activeThread.cursor = page.nextUntil;
                state.activeThread.isLoading = false;
                state.activeThread.error = null;
                emitChange();
            } catch (error) {
                if (!state.activeThread || state.activeThread.rootEventId !== rootEventId) {
                    return;
                }

                state.activeThread.isLoading = false;
                state.activeThread.error = error instanceof Error ? error.message : 'No se pudo cargar el hilo';
                emitChange();
            }
        },

        closeThread() {
            state.activeThread = null;
            emitChange();
        },

        async loadNextThreadPage() {
            if (!state.activeThread || state.activeThread.isLoadingMore || !state.activeThread.hasMore || disposed) {
                return;
            }

            const rootEventId = state.activeThread.rootEventId;
            state.activeThread.isLoadingMore = true;
            state.activeThread.error = null;
            emitChange();

            try {
                const page = await options.service.loadThread({
                    rootEventId,
                    limit: threadPageSize,
                    until: state.activeThread.cursor,
                });

                if (!state.activeThread || state.activeThread.rootEventId !== rootEventId) {
                    return;
                }

                if (!state.activeThread.root && page.root) {
                    state.activeThread.root = page.root;
                }
                state.activeThread.replies = mergeThreadReplies(state.activeThread.replies, page.replies);
                state.activeThread.hasMore = page.hasMore;
                state.activeThread.cursor = page.nextUntil;
                state.activeThread.isLoadingMore = false;
                state.activeThread.error = null;
                emitChange();
            } catch (error) {
                if (!state.activeThread || state.activeThread.rootEventId !== rootEventId) {
                    return;
                }

                state.activeThread.isLoadingMore = false;
                state.activeThread.error = error instanceof Error ? error.message : 'No se pudieron cargar mas respuestas';
                emitChange();
            }
        },

        async publishPost(content) {
            const normalized = sanitizeContent(content);
            if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || normalized.length === 0 || disposed) {
                return false;
            }

            state.publishError = null;
            state.isPublishingPost = true;

            const tempId = `temp-post:${Date.now()}`;
            const tempNote = buildTemporaryFeedNote(tempId, options.ownerPubkey, now(), normalized);
            state.items = mergeFeedItems([tempNote], state.items);
            emitChange();

            try {
                const published = await options.writeGateway.publishTextNote(normalized, []);
                state.items = state.items.filter((item) => item.id !== tempId);
                const publishedItem = toFeedItemFromPublished(published);
                if (publishedItem) {
                    state.items = mergeFeedItems([publishedItem], state.items);
                }
                state.isPublishingPost = false;
                emitChange();
                return true;
            } catch (error) {
                state.items = state.items.filter((item) => item.id !== tempId);
                state.isPublishingPost = false;
                state.publishError = error instanceof Error ? error.message : 'No se pudo publicar la nota';
                emitChange();
                return false;
            }
        },

        async publishReply(input) {
            const normalized = sanitizeContent(input.content);
            if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || normalized.length === 0 || disposed) {
                return false;
            }

            state.publishError = null;
            state.isPublishingReply = true;

            const tempId = `temp-reply:${Date.now()}`;
            const tempReply = buildTemporaryThreadReply(tempId, options.ownerPubkey, now(), normalized, input.targetEventId);

            if (state.activeThread) {
                state.activeThread.replies = mergeThreadReplies([tempReply], state.activeThread.replies);
            }
            emitChange();

            try {
                const tags = buildReplyTags(input, state.activeThread);
                const published = await options.writeGateway.publishTextNote(normalized, tags);

                if (state.activeThread) {
                    state.activeThread.replies = state.activeThread.replies.filter((reply) => reply.id !== tempId);
                    state.activeThread.replies = mergeThreadReplies(
                        [toThreadItemFromPublished(published)],
                        state.activeThread.replies
                    );
                }
                state.isPublishingReply = false;
                emitChange();
                return true;
            } catch (error) {
                if (state.activeThread) {
                    state.activeThread.replies = state.activeThread.replies.filter((reply) => reply.id !== tempId);
                }
                state.isPublishingReply = false;
                state.publishError = error instanceof Error ? error.message : 'No se pudo publicar la respuesta';
                emitChange();
                return false;
            }
        },

        async toggleReaction(input) {
            if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || !input.eventId || disposed) {
                return false;
            }

            const eventId = input.eventId;
            const previous = Boolean(state.reactionByEventId[eventId]);
            const next = !previous;

            state.pendingReactionByEventId[eventId] = true;
            state.reactionByEventId[eventId] = next;
            state.publishError = null;
            emitChange();

            try {
                if (next) {
                    const tags = input.targetPubkey
                        ? [['e', eventId], ['p', input.targetPubkey]]
                        : [['e', eventId]];
                    const published = await options.writeGateway.publishEvent({
                        kind: 7,
                        content: input.emoji && input.emoji.length > 0 ? input.emoji : '+',
                        created_at: now(),
                        tags,
                    });
                    state.reactionEventIdByTarget[eventId] = published.id;
                } else {
                    const reactionEventId = state.reactionEventIdByTarget[eventId];
                    if (!reactionEventId) {
                        throw new Error('No hay reaccion local para eliminar');
                    }

                    await options.writeGateway.publishEvent({
                        kind: 5,
                        content: '',
                        created_at: now(),
                        tags: [['e', reactionEventId]],
                    });
                    delete state.reactionEventIdByTarget[eventId];
                }

                state.pendingReactionByEventId[eventId] = false;
                emitChange();
                return true;
            } catch (error) {
                state.reactionByEventId[eventId] = previous;
                state.pendingReactionByEventId[eventId] = false;
                state.publishError = error instanceof Error ? error.message : 'No se pudo actualizar la reaccion';
                emitChange();
                return false;
            }
        },

        async toggleRepost(input) {
            if (!options.ownerPubkey || !options.canWrite || !options.writeGateway || !input.eventId || disposed) {
                return false;
            }

            const eventId = input.eventId;
            const previous = Boolean(state.repostByEventId[eventId]);
            const next = !previous;

            state.pendingRepostByEventId[eventId] = true;
            state.repostByEventId[eventId] = next;
            state.publishError = null;
            emitChange();

            try {
                if (next) {
                    const tags = input.targetPubkey
                        ? [['e', eventId], ['p', input.targetPubkey]]
                        : [['e', eventId]];
                    const published = await options.writeGateway.publishEvent({
                        kind: 6,
                        content: input.repostContent ?? '',
                        created_at: now(),
                        tags,
                    });
                    state.repostEventIdByTarget[eventId] = published.id;
                } else {
                    const repostEventId = state.repostEventIdByTarget[eventId];
                    if (!repostEventId) {
                        throw new Error('No hay repost local para eliminar');
                    }

                    await options.writeGateway.publishEvent({
                        kind: 5,
                        content: '',
                        created_at: now(),
                        tags: [['e', repostEventId]],
                    });
                    delete state.repostEventIdByTarget[eventId];
                }

                state.pendingRepostByEventId[eventId] = false;
                emitChange();
                return true;
            } catch (error) {
                state.repostByEventId[eventId] = previous;
                state.pendingRepostByEventId[eventId] = false;
                state.publishError = error instanceof Error ? error.message : 'No se pudo actualizar el repost';
                emitChange();
                return false;
            }
        },

        dispose() {
            disposed = true;
        },
    };
}

export function useFollowingFeed(options: UseFollowingFeedOptions): FollowingFeedStore {
    const followsKey = useMemo(
        () => [...new Set(options.follows.filter((pubkey) => typeof pubkey === 'string' && pubkey.length > 0))].join(','),
        [options.follows]
    );

    const store = useMemo(
        () =>
            createFollowingFeedStore({
                ownerPubkey: options.ownerPubkey,
                follows: options.follows,
                canWrite: options.canWrite,
                service: options.service,
                writeGateway: options.writeGateway,
                now: options.now,
                pageSize: options.pageSize,
                threadPageSize: options.threadPageSize,
            }),
        [
            options.ownerPubkey,
            followsKey,
            options.canWrite,
            options.service,
            options.writeGateway,
            options.now,
            options.pageSize,
            options.threadPageSize,
        ]
    );

    useEffect(() => () => {
        store.dispose();
    }, [store]);

    useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);

    return store;
}
