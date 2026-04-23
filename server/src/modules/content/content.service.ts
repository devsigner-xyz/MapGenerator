import { SimplePool } from 'nostr-tools';

import type { AuthorRelayDirectory } from '../../relay/author-relay-directory';
import { createAuthorRelayDirectory } from '../../relay/author-relay-directory';
import { discoverFollowers, parseCandidateAuthors, parseFollowsFromKind3 } from '../../relay/follower-discovery';
import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { createRelayGateway } from '../../relay/relay-gateway';
import type {
  RelayGateway,
  RelayGatewayQueryContext,
} from '../../relay/relay-gateway.types';
import type { RelayQueryPlanner } from '../../relay/relay-query-planner';
import { createRelayQueryPlanner } from '../../relay/relay-query-planner';
import { relaySetKey } from '../../relay/relay-resolver';
import type {
  ContentPostsQuery,
  ContentPostsResponseDto,
  ProfileStatsQuery,
  ProfileStatsResponseDto,
} from './content.schemas';

type NostrEventLike = {
  id: string;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
};

const DEFAULT_BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const DEFAULT_RELAY_QUERY_TIMEOUT_MS = 7_000;

const normalizePubkey = (value: string): string => value.trim().toLowerCase();

const byCreatedAtDesc = (left: NostrEventLike, right: NostrEventLike): number => {
  if (left.created_at !== right.created_at) {
    return right.created_at - left.created_at;
  }

  return left.id.localeCompare(right.id);
};

const parsePostContent = (content: string): string => content.replace(/\s+/g, ' ').trim();

function toScopedReadRelays(value?: string | string[]): string[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export interface ContentServiceOptions {
  postsGateway?: RelayGateway<ContentPostsQuery, ContentPostsResponseDto>;
  profileStatsGateway?: RelayGateway<ProfileStatsQuery, ProfileStatsResponseDto>;
  authorRelayDirectory?: AuthorRelayDirectory;
  relayQueryPlanner?: RelayQueryPlanner;
  fetchPosts?: (
    query: ContentPostsQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<ContentPostsResponseDto>;
  fetchProfileStats?: (
    query: ProfileStatsQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<ProfileStatsResponseDto>;
  defaultTimeoutMs?: number;
  bootstrapRelays?: string[];
  pool?: SimplePool;
}

export interface ContentService {
  getPosts(query: ContentPostsQuery): Promise<ContentPostsResponseDto>;
  getProfileStats(query: ProfileStatsQuery): Promise<ProfileStatsResponseDto>;
}

class GatewayContentService implements ContentService {
  constructor(
    private readonly postsGateway: RelayGateway<ContentPostsQuery, ContentPostsResponseDto>,
    private readonly profileStatsGateway: RelayGateway<ProfileStatsQuery, ProfileStatsResponseDto>,
  ) {}

  async getPosts(query: ContentPostsQuery): Promise<ContentPostsResponseDto> {
    const scopedRelaySetKey = relaySetKey(toScopedReadRelays(query.scopedReadRelays));
    return this.postsGateway.query({
      key: `content:posts:${normalizePubkey(query.pubkey)}:${query.limit}:${query.until ?? ''}:${scopedRelaySetKey}`,
      params: query,
    });
  }

  async getProfileStats(query: ProfileStatsQuery): Promise<ProfileStatsResponseDto> {
    const candidateAuthors = parseCandidateAuthors(query.candidateAuthors);
    const scopedRelaySetKey = relaySetKey(toScopedReadRelays(query.scopedReadRelays));

    try {
      return await this.profileStatsGateway.query({
        key: `content:profile-stats:${normalizePubkey(query.pubkey)}:${candidateAuthors.join(',')}:${scopedRelaySetKey}`,
        params: query,
      });
    } catch {
      return {
        followsCount: 0,
        followersCount: 0,
      };
    }
  }
}

const createPoolFetchers = (options: {
  pool: SimplePool;
  bootstrapRelays: string[];
  relayQueryPlanner: RelayQueryPlanner;
}): {
  fetchPosts: (
    query: ContentPostsQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<ContentPostsResponseDto>;
  fetchProfileStats: (
    query: ProfileStatsQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<ProfileStatsResponseDto>;
} => {
  const queryWithFallback = async <T>(
    relaySets: { primary: string[]; fallback: string[] },
    queryFn: (relays: string[]) => Promise<T>,
    shouldFallbackResult?: (result: T) => boolean,
  ): Promise<T> => {
    if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary })) {
      return queryFn(relaySets.fallback);
    }

    try {
      const primaryResult = await queryFn(relaySets.primary);
      if (relaySets.fallback.length > 0 && shouldFallbackResult?.(primaryResult)) {
        return queryFn(relaySets.fallback);
      }

      return primaryResult;
    } catch (error) {
      if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary, error })) {
        return queryFn(relaySets.fallback);
      }

      throw error;
    }
  };

  const fetchPosts = async (
    query: ContentPostsQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<ContentPostsResponseDto> => {
    const pubkey = normalizePubkey(query.pubkey);
    const until = typeof query.until === 'number' && query.until > 0 ? query.until : undefined;
    const relaySets = await options.relayQueryPlanner.planPosts({
      scopedReadRelays: toScopedReadRelays(query.scopedReadRelays),
      targetPubkey: pubkey,
    });

    const events = await queryWithFallback(relaySets, async (relays) => {
      if (relays.length === 0) {
        return [] as NostrEventLike[];
      }

      return options.pool.querySync(relays, {
        authors: [pubkey],
        kinds: [1],
        until,
        limit: query.limit + 1,
      }) as Promise<NostrEventLike[]>;
    }, (events) => events.length === 0);

    const sorted = [...events].sort(byCreatedAtDesc);
    const hasMore = sorted.length > query.limit;
    const page = sorted.slice(0, query.limit);
    const nextUntil = hasMore && page.length > 0
      ? Math.max(0, page[page.length - 1].created_at - 1)
      : null;

    return {
      posts: page.map((event) => ({
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        content: parsePostContent(event.content),
      })),
      hasMore,
      nextUntil,
    };
  };

  const fetchProfileStats = async (
    query: ProfileStatsQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<ProfileStatsResponseDto> => {
    const targetPubkey = normalizePubkey(query.pubkey);
    const candidateAuthors = parseCandidateAuthors(query.candidateAuthors)
      .filter((author) => author !== targetPubkey);
    const targetScope = await options.relayQueryPlanner.planPosts({
      scopedReadRelays: toScopedReadRelays(query.scopedReadRelays),
      targetPubkey,
    });
    const followerPlan = await options.relayQueryPlanner.planFollowers({
      scopedReadRelays: toScopedReadRelays(query.scopedReadRelays),
      targetPubkey,
      candidateAuthors,
    });

    const followsResult = await queryWithFallback(targetScope, async (relays) => {
      if (relays.length === 0) {
        return null;
      }

      const events = await options.pool.querySync(relays, {
        authors: [targetPubkey],
        kinds: [3],
        limit: 1,
      }) as NostrEventLike[];

      return [...events].sort(byCreatedAtDesc)[0] ?? null;
    }, (event) => event === null);

    const discovery = await discoverFollowers({
      targetPubkey,
      ownerScope: followerPlan.ownerScope,
      candidateAuthorScopes: followerPlan.candidateAuthorScopes,
      queryEvents: async (relays, filter) => {
        return options.pool.querySync(relays, filter) as Promise<NostrEventLike[]>;
      },
    });

    return {
      followsCount: parseFollowsFromKind3(followsResult).length,
      followersCount: discovery.followers.length,
    };
  };

  return {
    fetchPosts,
    fetchProfileStats,
  };
};

export const createContentService = (options: ContentServiceOptions = {}): ContentService => {
  const pool = options.pool ?? new SimplePool();
  const bootstrapRelays = options.bootstrapRelays ?? DEFAULT_BOOTSTRAP_RELAYS;
  const authorRelayDirectory = options.authorRelayDirectory ?? createAuthorRelayDirectory({
    pool,
    bootstrapRelays,
  });
  const relayQueryPlanner = options.relayQueryPlanner ?? createRelayQueryPlanner({
    bootstrapRelays,
    authorRelayDirectory,
  });
  const fetchers = createPoolFetchers({
    pool,
    bootstrapRelays,
    relayQueryPlanner,
  });

  const postsGateway =
    options.postsGateway
    ?? createRelayGateway<ContentPostsQuery, ContentPostsResponseDto>({
      queryFn: options.fetchPosts ?? fetchers.fetchPosts,
      defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_RELAY_QUERY_TIMEOUT_MS,
      cache: {
        ttlMs: 10_000,
        maxEntries: 500,
      },
    });

  const profileStatsGateway =
    options.profileStatsGateway
    ?? createRelayGateway<ProfileStatsQuery, ProfileStatsResponseDto>({
      queryFn: options.fetchProfileStats ?? fetchers.fetchProfileStats,
      defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_RELAY_QUERY_TIMEOUT_MS,
      cache: {
        ttlMs: 10_000,
        maxEntries: 500,
      },
    });

  return new GatewayContentService(postsGateway, profileStatsGateway);
};
