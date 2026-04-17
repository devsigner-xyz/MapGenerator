import {
    toSocialFeedItem,
    toSocialThreadItem,
    type SocialEngagementByEventId,
    type SocialFeedPage,
    type SocialFeedService,
    type SocialThreadPage,
} from '../nostr/social-feed-service';
import type { NostrEvent } from '../nostr/types';
import { createHttpClient, type HttpClient } from './http-client';

interface SocialEventDto {
    id: string;
    pubkey: string;
    kind: number;
    createdAt: number;
    content: string;
    tags: string[][];
}

interface FollowingFeedResponseDto {
    items: SocialEventDto[];
    hasMore: boolean;
    nextUntil: number | null;
}

interface ThreadResponseDto {
    root: SocialEventDto | null;
    replies: SocialEventDto[];
    hasMore: boolean;
    nextUntil: number | null;
}

interface EngagementMetricsDto {
    replies: number;
    reposts: number;
    reactions: number;
    zaps: number;
    zapSats: number;
}

interface EngagementResponseDto {
    byEventId: Record<string, EngagementMetricsDto>;
}

export interface CreateSocialFeedApiServiceOptions {
    client?: HttpClient;
    resolveOwnerPubkey?: () => string | undefined;
    now?: () => number;
}

function toNostrEvent(dto: SocialEventDto): NostrEvent {
    return {
        id: dto.id,
        pubkey: dto.pubkey,
        kind: dto.kind,
        created_at: dto.createdAt,
        content: dto.content,
        tags: dto.tags,
    };
}

function mapFeedResponse(dto: FollowingFeedResponseDto): SocialFeedPage {
    const items = dto.items
        .map((item) => toSocialFeedItem(toNostrEvent(item)))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return {
        items,
        hasMore: dto.hasMore,
        nextUntil: dto.nextUntil ?? undefined,
    };
}

function mapThreadResponse(dto: ThreadResponseDto): SocialThreadPage {
    return {
        root: dto.root ? toSocialThreadItem(toNostrEvent(dto.root)) : null,
        replies: dto.replies.map((item) => toSocialThreadItem(toNostrEvent(item))),
        hasMore: dto.hasMore,
        nextUntil: dto.nextUntil ?? undefined,
    };
}

function resolveOwnerPubkeyOrThrow(resolveOwnerPubkey?: () => string | undefined): string {
    const ownerPubkey = resolveOwnerPubkey?.()?.trim();
    if (!ownerPubkey) {
        throw new Error('ownerPubkey is required for social feed API requests');
    }

    return ownerPubkey;
}

export function createSocialFeedApiService(options: CreateSocialFeedApiServiceOptions = {}): SocialFeedService {
    const client = options.client ?? createHttpClient();
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));

    return {
        async loadFollowingFeed(input) {
            if (!input.follows || input.follows.length === 0) {
                return {
                    items: [],
                    hasMore: false,
                    nextUntil: undefined,
                };
            }

            const ownerPubkey = resolveOwnerPubkeyOrThrow(options.resolveOwnerPubkey);
            const response = await client.getJson<FollowingFeedResponseDto>('/social/feed/following', {
                query: {
                    ownerPubkey,
                    limit: input.limit ?? 20,
                    until: input.until ?? now(),
                },
            });

            return mapFeedResponse(response);
        },

        async loadHashtagFeed(input) {
            const ownerPubkey = resolveOwnerPubkeyOrThrow(options.resolveOwnerPubkey);
            const response = await client.getJson<FollowingFeedResponseDto>('/social/feed/following', {
                query: {
                    ownerPubkey,
                    limit: input.limit ?? 20,
                    until: input.until ?? now(),
                    hashtag: input.hashtag,
                },
            });

            return mapFeedResponse(response);
        },

        async loadThread(input) {
            const encodedRootEventId = encodeURIComponent(input.rootEventId);
            const response = await client.getJson<ThreadResponseDto>(`/social/thread/${encodedRootEventId}`, {
                query: {
                    limit: input.limit ?? 25,
                    until: input.until ?? now(),
                },
            });

            return mapThreadResponse(response);
        },

        async loadEngagement(input): Promise<SocialEngagementByEventId> {
            if (!input.eventIds || input.eventIds.length === 0) {
                return {};
            }

            const response = await client.postJson<EngagementResponseDto>('/social/engagement', {
                body: {
                    eventIds: input.eventIds,
                    until: input.until,
                },
            });

            return response.byEventId;
        },
    };
}
