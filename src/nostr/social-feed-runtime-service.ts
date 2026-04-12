import { createLazyNdkDmTransport } from './lazy-ndk-client';
import { getBootstrapRelays } from './relay-policy';
import { loadRelaySettings } from './relay-settings';
import type { DmTransport } from './dm-transport';
import {
    extractTargetEventId,
    isReplyEvent,
    isMainFeedEvent,
    toSocialFeedItem,
    toSocialThreadItem,
    type LoadEngagementInput,
    type LoadFollowingFeedInput,
    type LoadThreadInput,
    type SocialEngagementByEventId,
    type SocialEngagementMetrics,
    type SocialFeedPage,
    type SocialFeedService,
    type SocialThreadItem,
    type SocialThreadPage,
} from './social-feed-service';
import type { NostrEvent } from './types';

const MAIN_FEED_KINDS = [1, 6, 16] as const;
const THREAD_REPLY_KINDS = [1] as const;
const ENGAGEMENT_KINDS = [1, 6, 7, 16, 9735] as const;

const DEFAULT_FEED_LIMIT = 30;
const DEFAULT_THREAD_LIMIT = 40;
const DEFAULT_ENGAGEMENT_LIMIT = 120;
const QUERY_LIMIT_MULTIPLIER = 3;
const MIN_QUERY_LIMIT = 24;
const MAX_QUERY_LIMIT = 180;
const MAX_MAIN_FEED_PASSES = 4;
const MAX_AUTHORS_PER_FILTER = 120;

interface CreateRuntimeSocialFeedServiceOptions {
    createTransport?: (relays: string[]) => DmTransport;
    resolveRelays?: () => string[];
}

function resolveRuntimeSocialRelays(): string[] {
    const settings = loadRelaySettings();
    if (settings.relays.length > 0) {
        return settings.relays;
    }

    return getBootstrapRelays();
}

function normalizeRelaySet(relays: string[]): string[] {
    const set = new Set<string>();
    for (const relay of relays) {
        if (!relay || typeof relay !== 'string') {
            continue;
        }

        set.add(relay);
    }

    return [...set];
}

function clampLimit(limit: number | undefined, fallback: number): number {
    const value = Number.isFinite(limit) ? Number(limit) : fallback;
    return Math.max(1, Math.floor(value));
}

function resolveQueryLimit(limit: number): number {
    const scaled = limit * QUERY_LIMIT_MULTIPLIER;
    return Math.min(MAX_QUERY_LIMIT, Math.max(MIN_QUERY_LIMIT, scaled));
}

function chunkAuthors(authors: string[]): string[][] {
    const normalized = [...new Set(authors.filter((author) => typeof author === 'string' && author.length > 0))];
    if (normalized.length === 0) {
        return [];
    }

    const chunks: string[][] = [];
    for (let index = 0; index < normalized.length; index += MAX_AUTHORS_PER_FILTER) {
        chunks.push(normalized.slice(index, index + MAX_AUTHORS_PER_FILTER));
    }

    return chunks;
}

function isValidRuntimeEvent(event: NostrEvent): boolean {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (typeof event.id !== 'string' || event.id.length === 0) {
        return false;
    }

    if (typeof event.pubkey !== 'string' || event.pubkey.length === 0) {
        return false;
    }

    if (!Number.isFinite(event.kind) || !Number.isFinite(event.created_at)) {
        return false;
    }

    if (typeof event.content !== 'string' || !Array.isArray(event.tags)) {
        return false;
    }

    return event.tags.every((tag) => Array.isArray(tag) && tag.every((value) => typeof value === 'string'));
}

function sortAndDedupe(events: NostrEvent[]): NostrEvent[] {
    const byId = new Map<string, NostrEvent>();
    for (const event of events) {
        if (!isValidRuntimeEvent(event)) {
            continue;
        }

        byId.set(event.id, event);
    }

    return [...byId.values()].sort((left, right) => {
        if (left.created_at !== right.created_at) {
            return right.created_at - left.created_at;
        }

        return left.id.localeCompare(right.id);
    });
}

function hasRootTag(event: NostrEvent, rootEventId: string): boolean {
    return event.tags.some((tag) => Array.isArray(tag) && tag[0] === 'e' && tag[1] === rootEventId);
}

function nextUntilFromItems(items: Array<{ createdAt: number }>): number | undefined {
    if (items.length === 0) {
        return undefined;
    }

    return items[items.length - 1].createdAt - 1;
}

function createEmptyEngagementMetrics(): SocialEngagementMetrics {
    return {
        replies: 0,
        reposts: 0,
        reactions: 0,
        zaps: 0,
    };
}

function normalizeTargetEventIds(eventIds: string[]): string[] {
    return [...new Set(eventIds.filter((eventId) => typeof eventId === 'string' && eventId.length > 0))];
}

export function createRuntimeSocialFeedService(
    options: CreateRuntimeSocialFeedServiceOptions = {}
): SocialFeedService {
    const createTransport = options.createTransport ?? ((relays: string[]) => createLazyNdkDmTransport({ relays }));
    const resolveRelays = options.resolveRelays ?? resolveRuntimeSocialRelays;

    const resolveTransport = (): DmTransport => {
        const relays = normalizeRelaySet(resolveRelays());
        return createTransport(relays);
    };

    return {
        async loadFollowingFeed(input: LoadFollowingFeedInput): Promise<SocialFeedPage> {
            const follows = [...new Set(input.follows.filter((pubkey) => typeof pubkey === 'string' && pubkey.length > 0))];
            if (follows.length === 0) {
                return {
                    items: [],
                    hasMore: false,
                };
            }

            const transport = resolveTransport();
            const limit = clampLimit(input.limit, DEFAULT_FEED_LIMIT);
            const queryLimit = resolveQueryLimit(limit);
            const authorChunks = chunkAuthors(follows);
            const collected = new Map<string, ReturnType<typeof toSocialFeedItem>>();

            let cursorUntil = input.until;
            let reachedSourceEnd = false;
            let pass = 0;

            while (collected.size < limit + 1 && pass < MAX_MAIN_FEED_PASSES) {
                pass += 1;
                const batchEvents: NostrEvent[] = [];
                let allChunksExhausted = true;
                let maxChunkOldest: number | null = null;

                for (const authorChunk of authorChunks) {
                    const events = await transport.fetchBackfill([{
                        authors: authorChunk,
                        kinds: [...MAIN_FEED_KINDS],
                        limit: queryLimit,
                        until: cursorUntil,
                    }]);

                    const chunkEvents = sortAndDedupe(events as NostrEvent[]);
                    if (chunkEvents.length >= queryLimit) {
                        allChunksExhausted = false;
                    }

                    if (chunkEvents.length === 0) {
                        continue;
                    }

                    batchEvents.push(...chunkEvents);

                    const chunkOldest = chunkEvents[chunkEvents.length - 1]?.created_at;
                    if (Number.isFinite(chunkOldest)) {
                        if (maxChunkOldest === null || chunkOldest > maxChunkOldest) {
                            maxChunkOldest = chunkOldest;
                        }
                    }
                }

                const sorted = sortAndDedupe(batchEvents);
                if (sorted.length === 0) {
                    reachedSourceEnd = true;
                    break;
                }

                for (const event of sorted) {
                    if (!isMainFeedEvent(event)) {
                        continue;
                    }

                    const item = toSocialFeedItem(event);
                    if (!item || collected.has(item.id)) {
                        continue;
                    }

                    collected.set(item.id, item);
                    if (collected.size >= limit + 1) {
                        break;
                    }
                }

                if (!Number.isFinite(maxChunkOldest)) {
                    reachedSourceEnd = true;
                    break;
                }

                cursorUntil = maxChunkOldest - 1;

                if (allChunksExhausted) {
                    reachedSourceEnd = true;
                    break;
                }
            }

            const sortedItems = [...collected.values()]
                .filter((item): item is NonNullable<typeof item> => item !== null)
                .sort((left, right) => {
                    if (left.createdAt !== right.createdAt) {
                        return right.createdAt - left.createdAt;
                    }

                    return left.id.localeCompare(right.id);
                });

            const pageItems = sortedItems.slice(0, limit);
            const endedByPassCap = !reachedSourceEnd
                && pass >= MAX_MAIN_FEED_PASSES
                && collected.size < limit + 1;
            const hasMore = sortedItems.length > limit || endedByPassCap;
            const nextUntil = !hasMore
                ? undefined
                : sortedItems.length > limit
                    ? nextUntilFromItems(pageItems)
                    : cursorUntil;

            return {
                items: pageItems,
                hasMore,
                nextUntil,
            };
        },

        async loadThread(input: LoadThreadInput): Promise<SocialThreadPage> {
            const rootEventId = input.rootEventId;
            if (!rootEventId || typeof rootEventId !== 'string') {
                return {
                    root: null,
                    replies: [],
                    hasMore: false,
                };
            }

            const transport = resolveTransport();
            const limit = clampLimit(input.limit, DEFAULT_THREAD_LIMIT);
            const queryLimit = resolveQueryLimit(limit);

            const events = await transport.fetchBackfill([
                {
                    ids: [rootEventId],
                    limit: 1,
                },
                {
                    kinds: [...THREAD_REPLY_KINDS],
                    '#e': [rootEventId],
                    limit: queryLimit,
                    until: input.until,
                },
            ]);

            const sorted = sortAndDedupe(events as NostrEvent[]);
            let root: SocialThreadItem | null = null;
            const replies: SocialThreadItem[] = [];

            for (const event of sorted) {
                if (event.id === rootEventId && !root) {
                    root = toSocialThreadItem(event);
                    continue;
                }

                if (event.kind !== 1) {
                    continue;
                }

                if (!hasRootTag(event, rootEventId)) {
                    continue;
                }

                replies.push(toSocialThreadItem(event));
            }

            const pagedReplies = replies.slice(0, limit);
            const hasMore = replies.length > limit;

            return {
                root,
                replies: pagedReplies,
                hasMore,
                nextUntil: hasMore ? nextUntilFromItems(pagedReplies) : undefined,
            };
        },

        async loadEngagement(input: LoadEngagementInput): Promise<SocialEngagementByEventId> {
            const targetEventIds = normalizeTargetEventIds(input.eventIds);
            const engagementByEventId: SocialEngagementByEventId = {};

            for (const eventId of targetEventIds) {
                engagementByEventId[eventId] = createEmptyEngagementMetrics();
            }

            if (targetEventIds.length === 0) {
                return engagementByEventId;
            }

            const transport = resolveTransport();
            const limit = clampLimit(input.limit, Math.max(DEFAULT_ENGAGEMENT_LIMIT, targetEventIds.length));
            const events = await transport.fetchBackfill([
                {
                    kinds: [...ENGAGEMENT_KINDS],
                    '#e': targetEventIds,
                    limit,
                    until: input.until,
                },
            ]);

            for (const event of sortAndDedupe(events as NostrEvent[])) {
                const targetEventId = extractTargetEventId(event);
                if (!targetEventId || !engagementByEventId[targetEventId]) {
                    continue;
                }

                if (event.kind === 7) {
                    engagementByEventId[targetEventId].reactions += 1;
                    continue;
                }

                if (event.kind === 6 || event.kind === 16) {
                    engagementByEventId[targetEventId].reposts += 1;
                    continue;
                }

                if (event.kind === 9735) {
                    engagementByEventId[targetEventId].zaps += 1;
                    continue;
                }

                if (event.kind === 1 && isReplyEvent(event)) {
                    engagementByEventId[targetEventId].replies += 1;
                }
            }

            return engagementByEventId;
        },
    };
}
