import type {
    SocialEngagementByEventId,
    SocialEngagementMetrics,
    SocialFeedItem,
    SocialFeedPage,
    SocialThreadItem,
    SocialThreadPage,
} from '../../nostr/social-feed-service';

const EMPTY_ENGAGEMENT_METRICS: SocialEngagementMetrics = {
    replies: 0,
    reposts: 0,
    reactions: 0,
    zaps: 0,
};

export interface FollowingFeedThreadView {
    rootEventId: string;
    root: SocialThreadItem | null;
    replies: SocialThreadItem[];
    isLoading: boolean;
    isLoadingMore: boolean;
    error: string | null;
    hasMore: boolean;
}

export function normalizeEventIds(eventIds: string[]): string[] {
    return [...new Set(eventIds.filter((eventId) => typeof eventId === 'string' && eventId.length > 0))];
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

export function mergeFeedItems(existing: SocialFeedItem[], incoming: SocialFeedItem[]): SocialFeedItem[] {
    const byId = new Map<string, SocialFeedItem>();
    for (const item of existing) {
        byId.set(item.id, item);
    }

    for (const item of incoming) {
        byId.set(item.id, item);
    }

    return sortFeedItems([...byId.values()]);
}

export function mergeThreadReplies(existing: SocialThreadItem[], incoming: SocialThreadItem[]): SocialThreadItem[] {
    const byId = new Map<string, SocialThreadItem>();
    for (const item of existing) {
        byId.set(item.id, item);
    }

    for (const item of incoming) {
        byId.set(item.id, item);
    }

    return sortThreadItems([...byId.values()]);
}

export function selectFeedItemsFromPages(pages: SocialFeedPage[] | undefined): SocialFeedItem[] {
    if (!pages || pages.length === 0) {
        return [];
    }

    let merged: SocialFeedItem[] = [];
    for (const page of pages) {
        merged = mergeFeedItems(merged, page.items);
    }

    return merged;
}

export function selectThreadViewFromPages(input: {
    rootEventId: string;
    pages: SocialThreadPage[] | undefined;
    isLoading: boolean;
    isLoadingMore: boolean;
    error: string | null;
    hasMore: boolean;
}): FollowingFeedThreadView {
    const pages = input.pages ?? [];
    let root: SocialThreadItem | null = null;
    let replies: SocialThreadItem[] = [];

    for (const page of pages) {
        if (!root && page.root) {
            root = page.root;
        }

        replies = mergeThreadReplies(replies, page.replies);
    }

    return {
        rootEventId: input.rootEventId,
        root,
        replies,
        isLoading: input.isLoading,
        isLoadingMore: input.isLoadingMore,
        error: input.error,
        hasMore: input.hasMore,
    };
}

export function applyEngagementDeltas(input: {
    eventIds: string[];
    baseByEventId: SocialEngagementByEventId;
    deltaByEventId: SocialEngagementByEventId;
}): SocialEngagementByEventId {
    const eventIds = normalizeEventIds(input.eventIds);
    const byEventId: SocialEngagementByEventId = {};

    for (const eventId of eventIds) {
        const base = input.baseByEventId[eventId] ?? EMPTY_ENGAGEMENT_METRICS;
        const delta = input.deltaByEventId[eventId] ?? EMPTY_ENGAGEMENT_METRICS;
        byEventId[eventId] = {
            replies: Math.max(0, (base.replies || 0) + (delta.replies || 0)),
            reposts: Math.max(0, (base.reposts || 0) + (delta.reposts || 0)),
            reactions: Math.max(0, (base.reactions || 0) + (delta.reactions || 0)),
            zaps: Math.max(0, (base.zaps || 0) + (delta.zaps || 0)),
        };
    }

    return byEventId;
}

export function createEmptyEngagementByEventIds(eventIds: string[]): SocialEngagementByEventId {
    const byEventId: SocialEngagementByEventId = {};
    for (const eventId of normalizeEventIds(eventIds)) {
        byEventId[eventId] = {
            ...EMPTY_ENGAGEMENT_METRICS,
        };
    }

    return byEventId;
}

export function collectEngagementEventIds(input: {
    items: SocialFeedItem[];
    activeThread: FollowingFeedThreadView | null;
}): string[] {
    return normalizeEventIds([
        ...input.items.map((item) => item.id),
        ...(input.activeThread?.root ? [input.activeThread.root.id] : []),
        ...(input.activeThread?.replies ?? []).map((reply) => reply.id),
    ]);
}
