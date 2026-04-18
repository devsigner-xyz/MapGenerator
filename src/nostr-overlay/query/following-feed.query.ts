import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
    SocialEngagementByEventId,
    SocialFeedPage,
    SocialFeedService,
    SocialThreadPage,
} from '../../nostr/social-feed-service';
import { nostrOverlayQueryKeys } from './keys';
import { createSocialQueryOptions } from './options';
import { normalizeEventIds } from './following-feed.selectors';

const DEFAULT_FEED_PAGE_SIZE = 20;
const DEFAULT_THREAD_PAGE_SIZE = 25;

interface UseFollowingFeedInfiniteQueryOptions {
    ownerPubkey?: string;
    follows: string[];
    hashtag?: string;
    service: SocialFeedService;
    enabled: boolean;
    pageSize?: number;
}

interface UseThreadInfiniteQueryOptions {
    rootEventId: string | null;
    service: SocialFeedService;
    enabled: boolean;
    pageSize?: number;
}

interface UseFollowingFeedEngagementQueryOptions {
    eventIds: string[];
    service: SocialFeedService;
    enabled: boolean;
}

function normalizeHashtag(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim().replace(/^#+/, '').toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
}

export function useFollowingFeedInfiniteQuery(options: UseFollowingFeedInfiniteQueryOptions) {
    const follows = normalizeEventIds(options.follows);
    const hashtag = normalizeHashtag(options.hashtag);
    const pageSize = Math.max(1, options.pageSize ?? DEFAULT_FEED_PAGE_SIZE);

    return useInfiniteQuery<SocialFeedPage, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.followingFeed({
            ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
            follows,
            ...(hashtag ? { hashtag } : {}),
            pageSize,
        }),
        queryFn: ({ pageParam }: { pageParam: unknown }) => {
            const until = typeof pageParam === 'number' ? pageParam : undefined;
            if (hashtag) {
                return options.service.loadHashtagFeed({
                    hashtag,
                    limit: pageSize,
                    ...(until !== undefined ? { until } : {}),
                });
            }

            return options.service.loadFollowingFeed({
                follows,
                limit: pageSize,
                ...(until !== undefined ? { until } : {}),
            });
        },
        enabled: options.enabled && (Boolean(hashtag) || follows.length > 0),
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialFeedPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }));
}

export function useThreadInfiniteQuery(options: UseThreadInfiniteQueryOptions) {
    const rootEventId = options.rootEventId;
    const pageSize = Math.max(1, options.pageSize ?? DEFAULT_THREAD_PAGE_SIZE);

    return useInfiniteQuery<SocialThreadPage, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.thread({
            rootEventId: rootEventId || '__none__',
            pageSize,
        }),
        queryFn: ({ pageParam }: { pageParam: unknown }) => {
            if (!rootEventId) {
                return Promise.resolve({
                    root: null,
                    replies: [],
                    hasMore: false,
                });
            }

            const until = typeof pageParam === 'number' ? pageParam : undefined;

            return options.service.loadThread({
                rootEventId,
                limit: pageSize,
                ...(until !== undefined ? { until } : {}),
            });
        },
        enabled: options.enabled && Boolean(rootEventId),
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialThreadPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }));
}

export function useFollowingFeedEngagementQuery(options: UseFollowingFeedEngagementQueryOptions) {
    const eventIds = normalizeEventIds(options.eventIds);

    return useQuery<SocialEngagementByEventId, Error, SocialEngagementByEventId, ReturnType<typeof nostrOverlayQueryKeys.engagement>>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.engagement({ eventIds }),
        queryFn: () => options.service.loadEngagement({ eventIds }),
        enabled: options.enabled && eventIds.length > 0,
    }));
}
