import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NostrPostPreview } from '../../nostr/posts';
import type { NostrProfile } from '../../nostr/types';

export interface ActiveProfilePostsPage {
    posts: NostrPostPreview[];
    nextUntil?: number;
    hasMore: boolean;
}

export interface ActiveProfileStatsResult {
    followsCount: number;
    followersCount: number;
}

export interface ActiveProfileNetworkResult {
    follows: string[];
    followers: string[];
    profiles: Record<string, NostrProfile>;
}

export interface ActiveProfileQueryService {
    loadPosts: (input: { pubkey: string; limit?: number; until?: number }) => Promise<ActiveProfilePostsPage>;
    loadStats: (input: { pubkey: string }) => Promise<ActiveProfileStatsResult>;
    loadNetwork: (input: { pubkey: string }) => Promise<ActiveProfileNetworkResult>;
}

interface UseActiveProfileQueryInput {
    pubkey?: string;
    service: ActiveProfileQueryService;
    pageSize?: number;
}

interface ActiveProfileQueryState {
    posts: NostrPostPreview[];
    postsLoading: boolean;
    postsError?: string;
    hasMorePosts: boolean;
    followsCount: number;
    followersCount: number;
    statsLoading: boolean;
    statsError?: string;
    follows: string[];
    followers: string[];
    networkProfiles: Record<string, NostrProfile>;
    networkLoading: boolean;
    networkError?: string;
    loadMorePosts: () => Promise<void>;
}

const DEFAULT_PAGE_SIZE = 10;

const EMPTY_NETWORK: ActiveProfileNetworkResult = {
    follows: [],
    followers: [],
    profiles: {},
};

function toErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

export function useActiveProfileQuery(input: UseActiveProfileQueryInput): ActiveProfileQueryState {
    const pubkey = input.pubkey;
    const pageSize = Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE);

    const postsQuery = useInfiniteQuery<ActiveProfilePostsPage>({
        queryKey: ['nostr-overlay', 'social', 'active-profile', 'posts', { pubkey: pubkey || '__none__', pageSize }] as const,
        queryFn: ({ pageParam }) => {
            if (!pubkey) {
                return Promise.resolve({
                    posts: [],
                    nextUntil: undefined,
                    hasMore: false,
                });
            }

            return input.service.loadPosts({
                pubkey,
                limit: pageSize,
                until: typeof pageParam === 'number' ? pageParam : undefined,
            });
        },
        enabled: Boolean(pubkey),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
        staleTime: 5 * 60_000,
    });

    const statsQuery = useQuery({
        queryKey: ['nostr-overlay', 'social', 'active-profile', 'stats', { pubkey: pubkey || '__none__' }] as const,
        queryFn: () => {
            if (!pubkey) {
                return Promise.resolve({ followsCount: 0, followersCount: 0 });
            }

            return input.service.loadStats({ pubkey });
        },
        enabled: Boolean(pubkey),
        retry: 0,
        staleTime: 5 * 60_000,
    });

    const networkQuery = useQuery({
        queryKey: ['nostr-overlay', 'social', 'active-profile', 'network', { pubkey: pubkey || '__none__' }] as const,
        queryFn: () => {
            if (!pubkey) {
                return Promise.resolve(EMPTY_NETWORK);
            }

            return input.service.loadNetwork({ pubkey });
        },
        enabled: Boolean(pubkey),
        staleTime: 5 * 60_000,
    });

    const posts = useMemo(() => {
        const allPosts = postsQuery.data?.pages.flatMap((page) => page.posts) ?? [];
        if (allPosts.length <= 1) {
            return allPosts;
        }

        const seen = new Set<string>();
        return allPosts.filter((post) => {
            if (seen.has(post.id)) {
                return false;
            }
            seen.add(post.id);
            return true;
        });
    }, [postsQuery.data?.pages]);

    const loadMorePosts = useCallback(async () => {
        if (!postsQuery.hasNextPage || postsQuery.isFetchingNextPage) {
            return;
        }

        await postsQuery.fetchNextPage();
    }, [postsQuery]);

    const network = networkQuery.data ?? EMPTY_NETWORK;
    const followsCount = statsQuery.data?.followsCount ?? network.follows.length;
    const followersCount = statsQuery.data?.followersCount ?? network.followers.length;

    return {
        posts,
        postsLoading: postsQuery.isPending || postsQuery.isFetchingNextPage,
        postsError: postsQuery.error ? toErrorMessage(postsQuery.error, 'No se pudieron cargar publicaciones') : undefined,
        hasMorePosts: Boolean(postsQuery.hasNextPage),
        followsCount,
        followersCount,
        statsLoading: statsQuery.isPending,
        statsError: statsQuery.error ? toErrorMessage(statsQuery.error, 'No se pudo cargar estadisticas del perfil') : undefined,
        follows: network.follows,
        followers: network.followers,
        networkProfiles: network.profiles,
        networkLoading: networkQuery.isPending,
        networkError: networkQuery.error ? toErrorMessage(networkQuery.error, 'No se pudo cargar red social del perfil') : undefined,
        loadMorePosts,
    };
}
