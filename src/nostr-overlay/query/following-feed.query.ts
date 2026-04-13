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

export function useFollowingFeedInfiniteQuery(options: UseFollowingFeedInfiniteQueryOptions) {
    const follows = normalizeEventIds(options.follows);
    const pageSize = Math.max(1, options.pageSize ?? DEFAULT_FEED_PAGE_SIZE);

    return useInfiniteQuery<SocialFeedPage, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.followingFeed({
            ownerPubkey: options.ownerPubkey,
            follows,
            pageSize,
        }),
        queryFn: ({ pageParam }: { pageParam: unknown }) => options.service.loadFollowingFeed({
            follows,
            limit: pageSize,
            until: typeof pageParam === 'number' ? pageParam : undefined,
        }),
        enabled: options.enabled && follows.length > 0,
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialFeedPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }) as any);
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
                    nextUntil: undefined,
                });
            }

            return options.service.loadThread({
                rootEventId,
                limit: pageSize,
                until: typeof pageParam === 'number' ? pageParam : undefined,
            });
        },
        enabled: options.enabled && Boolean(rootEventId),
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialThreadPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }) as any);
}

export function useFollowingFeedEngagementQuery(options: UseFollowingFeedEngagementQueryOptions) {
    const eventIds = normalizeEventIds(options.eventIds);

    return useQuery<SocialEngagementByEventId, Error, SocialEngagementByEventId, ReturnType<typeof nostrOverlayQueryKeys.engagement>>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.engagement({ eventIds }),
        queryFn: () => options.service.loadEngagement({ eventIds }),
        enabled: options.enabled && eventIds.length > 0,
    }));
}
