import { createLazyNdkDmTransport } from './lazy-ndk-client';
import { resolveConservativeSocialRelaySets, hasSameRelaySet, normalizeRelaySet } from './relay-runtime';
import { createTransportPool, type TransportPool } from './transport-pool';
import type { DmTransport } from './dm-transport';
import {
    extractTargetEventId,
    isReplyEvent,
    isMainFeedEvent,
    type LoadHashtagFeedInput,
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
import type { NostrEvent, NostrFilter } from './types';

const MAIN_FEED_KINDS = [1, 6, 16] as const;
const THREAD_REPLY_KINDS = [1] as const;
const ENGAGEMENT_KINDS = [1, 6, 7, 16, 9735] as const;

const DEFAULT_FEED_LIMIT = 30;
const DEFAULT_THREAD_LIMIT = 40;
const DEFAULT_ENGAGEMENT_LIMIT = 120;
const DEFAULT_BACKFILL_TIMEOUT_MS = 7_000;
const QUERY_LIMIT_MULTIPLIER = 3;
const MIN_QUERY_LIMIT = 24;
const MAX_QUERY_LIMIT = 180;
const MAX_MAIN_FEED_PASSES = 4;
const MAX_AUTHORS_PER_FILTER = 120;
const MAX_EVENT_IDS_PER_FILTER = 120;

interface CreateRuntimeSocialFeedServiceOptions {
    createTransport?: (relays: string[]) => DmTransport;
    resolveRelays?: () => string[];
    resolveFallbackRelays?: (primaryRelays: string[]) => string[];
    transportPool?: TransportPool<DmTransport>;
    backfillTimeoutMs?: number;
}

function resolveRuntimeSocialRelays(): string[] {
    return resolveConservativeSocialRelaySets().primary;
}

function resolveRuntimeSocialFallbackRelays(primaryRelays: string[]): string[] {
    const fallback = resolveConservativeSocialRelaySets().fallback;
    return hasSameRelaySet(primaryRelays, fallback) ? [] : fallback;
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

function chunkEventIds(eventIds: string[]): string[][] {
    const normalized = normalizeTargetEventIds(eventIds);
    if (normalized.length === 0) {
        return [];
    }

    const chunks: string[][] = [];
    for (let index = 0; index < normalized.length; index += MAX_EVENT_IDS_PER_FILTER) {
        chunks.push(normalized.slice(index, index + MAX_EVENT_IDS_PER_FILTER));
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
        zapSats: 0,
    };
}

function normalizeTargetEventIds(eventIds: string[]): string[] {
    return [...new Set(eventIds.filter((eventId) => typeof eventId === 'string' && eventId.length > 0))];
}

function normalizeHashtag(hashtag: string): string {
    return hashtag.trim().replace(/^#+/, '').toLowerCase();
}

function getTagValues(event: NostrEvent, key: string): string[] {
    return event.tags
        .filter((tag) => Array.isArray(tag) && tag[0] === key && typeof tag[1] === 'string' && tag[1].length > 0)
        .map((tag) => tag[1]);
}

function getTargetByMarkers(event: NostrEvent, targetSet: Set<string>): string | undefined {
    const eTags = event.tags.filter((tag) => Array.isArray(tag) && tag[0] === 'e' && typeof tag[1] === 'string' && tag[1].length > 0);

    for (const tag of eTags) {
        if (tag[3] === 'reply' && targetSet.has(tag[1])) {
            return tag[1];
        }
    }

    for (const tag of eTags) {
        if (tag[3] === 'root' && targetSet.has(tag[1])) {
            return tag[1];
        }
    }

    for (let index = eTags.length - 1; index >= 0; index -= 1) {
        const candidate = eTags[index][1];
        if (targetSet.has(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

function resolveEngagementTargetEventId(event: NostrEvent, targetSet: Set<string>): string | undefined {
    if (event.kind === 6 || event.kind === 16) {
        const qTags = getTagValues(event, 'q');
        for (let index = qTags.length - 1; index >= 0; index -= 1) {
            if (targetSet.has(qTags[index])) {
                return qTags[index];
            }
        }
    }

    if (event.kind === 1 && isReplyEvent(event)) {
        const markerTarget = getTargetByMarkers(event, targetSet);
        if (markerTarget) {
            return markerTarget;
        }
    }

    const extracted = extractTargetEventId(event);
    if (extracted && targetSet.has(extracted)) {
        return extracted;
    }

    return undefined;
}

function parseZapMsatsFromDescription(event: NostrEvent): number {
    const descriptionValues = getTagValues(event, 'description');
    if (descriptionValues.length === 0) {
        return 0;
    }

    const latest = descriptionValues[descriptionValues.length - 1];
    try {
        const parsed = JSON.parse(latest) as { tags?: unknown };
        if (!parsed || !Array.isArray(parsed.tags)) {
            return 0;
        }

        for (const rawTag of parsed.tags) {
            if (!Array.isArray(rawTag) || rawTag[0] !== 'amount' || typeof rawTag[1] !== 'string') {
                continue;
            }

            const msats = Number(rawTag[1]);
            if (Number.isFinite(msats) && msats > 0) {
                return msats;
            }
        }
    } catch {
        return 0;
    }

    return 0;
}

function parseZapSats(event: NostrEvent): number {
    const fromDescriptionMsats = parseZapMsatsFromDescription(event);
    if (fromDescriptionMsats > 0) {
        return Math.max(0, Math.floor(fromDescriptionMsats / 1000));
    }

    const amountValues = getTagValues(event, 'amount');
    if (amountValues.length > 0) {
        const latestAmount = Number(amountValues[amountValues.length - 1]);
        if (Number.isFinite(latestAmount) && latestAmount > 0) {
            return Math.max(0, Math.floor(latestAmount / 1000));
        }
    }

    return 0;
}

function isRelayTransportError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relay|eose|timeout|network|websocket|disconnect/i.test(error.message);
}

async function fetchBackfillWithTimeout(
    transport: DmTransport,
    filters: NostrFilter[],
    timeoutMs: number
): Promise<NostrEvent[]> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            transport.fetchBackfill(filters),
            new Promise<NostrEvent[]>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`relay timeout after ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

export function createRuntimeSocialFeedService(
    options: CreateRuntimeSocialFeedServiceOptions = {}
): SocialFeedService {
    const createTransport = options.createTransport ?? ((relays: string[]) => createLazyNdkDmTransport({ relays }));
    const resolveRelays = options.resolveRelays ?? resolveRuntimeSocialRelays;
    const resolveFallbackRelays = options.resolveFallbackRelays ?? resolveRuntimeSocialFallbackRelays;
    const transportPool = options.transportPool ?? createTransportPool<DmTransport>();
    const backfillTimeoutMs = Number.isFinite(options.backfillTimeoutMs)
        ? Math.max(1, Math.floor(options.backfillTimeoutMs as number))
        : DEFAULT_BACKFILL_TIMEOUT_MS;

    const resolveTransport = (relays: string[]): DmTransport => {
        return transportPool.getOrCreate(relays, createTransport);
    };

    const withRelayFallback = async <T>(operation: (transport: DmTransport) => Promise<T>): Promise<T> => {
        const primaryRelays = normalizeRelaySet(resolveRelays());
        const primaryTransport = resolveTransport(primaryRelays);

        try {
            return await operation(primaryTransport);
        } catch (primaryError) {
            if (!isRelayTransportError(primaryError)) {
                throw primaryError;
            }

            const fallbackRelays = normalizeRelaySet(resolveFallbackRelays(primaryRelays));
            if (fallbackRelays.length === 0 || hasSameRelaySet(primaryRelays, fallbackRelays)) {
                throw primaryError;
            }

            const fallbackTransport = resolveTransport(fallbackRelays);
            return operation(fallbackTransport);
        }
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

            return withRelayFallback(async (transport) => {
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
                        const events = await fetchBackfillWithTimeout(transport, [{
                            authors: authorChunk,
                            kinds: [...MAIN_FEED_KINDS],
                            limit: queryLimit,
                            until: cursorUntil,
                        }], backfillTimeoutMs);

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
            });
        },

        async loadHashtagFeed(input: LoadHashtagFeedInput): Promise<SocialFeedPage> {
            const hashtag = normalizeHashtag(input.hashtag);
            if (!hashtag) {
                return {
                    items: [],
                    hasMore: false,
                };
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, DEFAULT_FEED_LIMIT);
                const queryLimit = resolveQueryLimit(limit);
                const collected = new Map<string, ReturnType<typeof toSocialFeedItem>>();

                let cursorUntil = input.until;
                let reachedSourceEnd = false;
                let pass = 0;

                while (collected.size < limit + 1 && pass < MAX_MAIN_FEED_PASSES) {
                    pass += 1;

                    const events = await fetchBackfillWithTimeout(transport, [{
                        kinds: [...MAIN_FEED_KINDS],
                        '#t': [hashtag],
                        limit: queryLimit,
                        until: cursorUntil,
                    }], backfillTimeoutMs);

                    const sorted = sortAndDedupe(events as NostrEvent[]);
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

                    const oldest = sorted[sorted.length - 1]?.created_at;
                    if (!Number.isFinite(oldest)) {
                        reachedSourceEnd = true;
                        break;
                    }

                    cursorUntil = oldest - 1;
                    if (sorted.length < queryLimit) {
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
            });
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

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, DEFAULT_THREAD_LIMIT);
                const queryLimit = resolveQueryLimit(limit);

                const events = await fetchBackfillWithTimeout(transport, [
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
                ], backfillTimeoutMs);

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
            });
        },

        async loadEngagement(input: LoadEngagementInput): Promise<SocialEngagementByEventId> {
            const targetEventIds = normalizeTargetEventIds(input.eventIds);
            const engagementByEventId: SocialEngagementByEventId = {};
            const targetSet = new Set(targetEventIds);

            for (const eventId of targetEventIds) {
                engagementByEventId[eventId] = createEmptyEngagementMetrics();
            }

            if (targetEventIds.length === 0) {
                return engagementByEventId;
            }

            return withRelayFallback(async (transport) => {
                const limit = clampLimit(input.limit, Math.max(DEFAULT_ENGAGEMENT_LIMIT, targetEventIds.length));
                const eventIdChunks = chunkEventIds(targetEventIds);
                const filters: NostrFilter[] = [];

                for (const chunk of eventIdChunks) {
                    filters.push({
                        kinds: [...ENGAGEMENT_KINDS],
                        '#e': chunk,
                        limit,
                        until: input.until,
                    });
                    filters.push({
                        kinds: [6, 16],
                        '#q': chunk,
                        limit,
                        until: input.until,
                    });
                }

                const events = await fetchBackfillWithTimeout(transport, filters, backfillTimeoutMs);

                for (const event of sortAndDedupe(events as NostrEvent[])) {
                    const targetEventId = resolveEngagementTargetEventId(event, targetSet);
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
                        engagementByEventId[targetEventId].zapSats += parseZapSats(event);
                        continue;
                    }

                    if (event.kind === 1 && isReplyEvent(event)) {
                        engagementByEventId[targetEventId].replies += 1;
                    }
                }

                return engagementByEventId;
            });
        },
    };
}
