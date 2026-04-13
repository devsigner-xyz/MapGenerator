import type { InfiniteData } from '@tanstack/react-query';
import type { SocialFeedItem, SocialFeedPage, SocialThreadItem, SocialThreadPage } from '../../nostr/social-feed-service';
import type { FollowingFeedThreadView } from './following-feed.selectors';
import { mergeFeedItems, mergeThreadReplies } from './following-feed.selectors';

export interface PublishEventInput {
    kind: number;
    content: string;
    created_at: number;
    tags: string[][];
}

export interface PublishEventResult {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
}

export interface WriteGatewayLike {
    publishEvent(event: PublishEventInput): Promise<PublishEventResult>;
    publishTextNote(content: string, tags?: string[][]): Promise<PublishEventResult>;
}

export interface PublishReplyInput {
    targetEventId: string;
    targetPubkey?: string;
    rootEventId?: string;
    content: string;
}

export interface ToggleReactionInput {
    eventId: string;
    targetPubkey?: string;
    emoji?: string;
}

export interface ToggleRepostInput {
    eventId: string;
    targetPubkey?: string;
    repostContent?: string;
}

export const followingFeedMutationKeys = {
    publishPost: ['nostr-overlay', 'social', 'following-feed', 'publish-post'] as const,
    publishReply: ['nostr-overlay', 'social', 'following-feed', 'publish-reply'] as const,
    toggleReaction: ['nostr-overlay', 'social', 'following-feed', 'toggle-reaction'] as const,
    toggleRepost: ['nostr-overlay', 'social', 'following-feed', 'toggle-repost'] as const,
};

export function sanitizeContent(content: string): string {
    return content.replace(/\s+/g, ' ').trim();
}

export function buildReplyTags(input: PublishReplyInput, activeThread: FollowingFeedThreadView | null): string[][] {
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

export function buildTemporaryFeedNote(id: string, pubkey: string, createdAt: number, content: string): SocialFeedItem {
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

export function buildTemporaryThreadReply(id: string, pubkey: string, createdAt: number, content: string, targetEventId: string): SocialThreadItem {
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

export function toFeedItemFromPublished(event: PublishEventResult): SocialFeedItem | null {
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

export function toThreadItemFromPublished(event: PublishEventResult): SocialThreadItem {
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

export function updateInfiniteFeedData(
    current: InfiniteData<SocialFeedPage> | undefined,
    updater: (currentItems: SocialFeedItem[]) => SocialFeedItem[]
): InfiniteData<SocialFeedPage> | undefined {
    if (!current || current.pages.length === 0) {
        return current;
    }

    const firstPage = current.pages[0];
    const updatedFirstPage: SocialFeedPage = {
        ...firstPage,
        items: updater(firstPage.items),
    };

    return {
        pages: [updatedFirstPage, ...current.pages.slice(1)],
        pageParams: current.pageParams,
    };
}

export function updateInfiniteThreadData(
    current: InfiniteData<SocialThreadPage> | undefined,
    updater: (currentReplies: SocialThreadItem[]) => SocialThreadItem[]
): InfiniteData<SocialThreadPage> | undefined {
    if (!current || current.pages.length === 0) {
        return current;
    }

    const firstPage = current.pages[0];
    const updatedFirstPage: SocialThreadPage = {
        ...firstPage,
        replies: updater(firstPage.replies),
    };

    return {
        pages: [updatedFirstPage, ...current.pages.slice(1)],
        pageParams: current.pageParams,
    };
}

export function prependReply(
    current: InfiniteData<SocialThreadPage> | undefined,
    reply: SocialThreadItem
): InfiniteData<SocialThreadPage> | undefined {
    return updateInfiniteThreadData(current, (currentReplies) => mergeThreadReplies([reply], currentReplies));
}

export function prependFeedItem(
    current: InfiniteData<SocialFeedPage> | undefined,
    item: SocialFeedItem
): InfiniteData<SocialFeedPage> | undefined {
    return updateInfiniteFeedData(current, (currentItems) => mergeFeedItems([item], currentItems));
}

export function buildPendingByEventId(eventIds: string[]): Record<string, boolean> {
    const byEventId: Record<string, boolean> = {};
    for (const eventId of eventIds) {
        if (!eventId) {
            continue;
        }

        byEventId[eventId] = true;
    }

    return byEventId;
}
