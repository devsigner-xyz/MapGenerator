import { SimplePool } from 'nostr-tools';

import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { createRelayGateway } from '../../relay/relay-gateway';
import type {
  RelayGateway,
  RelayGatewayQueryContext,
} from '../../relay/relay-gateway.types';
import { resolveRelaySets } from '../../relay/relay-resolver';
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

const HEX_64_REGEX = /^[0-9a-f]{64}$/;
const FOLLOWERS_TAG_BATCH_LIMIT = 120;
const FOLLOWERS_TAG_MAX_BATCHES = 3;
const CANDIDATE_AUTHOR_BATCH_SIZE = 40;
const DEFAULT_RELAY_QUERY_TIMEOUT_MS = 7_000;

const normalizePubkey = (value: string): string => value.trim().toLowerCase();

const isHexPubkey = (value: string): boolean => HEX_64_REGEX.test(value);

const byCreatedAtDesc = (left: NostrEventLike, right: NostrEventLike): number => {
  if (left.created_at !== right.created_at) {
    return right.created_at - left.created_at;
  }

  return left.id.localeCompare(right.id);
};

const parsePostContent = (content: string): string => content.replace(/\s+/g, ' ').trim();

const parseFollowsFromKind3 = (event: NostrEventLike | null | undefined): string[] => {
  if (!event) {
    return [];
  }

  const follows = new Set<string>();
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag[0] !== 'p' || typeof tag[1] !== 'string') {
      continue;
    }

    const candidate = normalizePubkey(tag[1]);
    if (isHexPubkey(candidate)) {
      follows.add(candidate);
    }
  }

  return [...follows];
};

const parseCandidateAuthors = (value?: string): string[] => {
  if (!value) {
    return [];
  }

  return [...new Set(
    value
      .split(',')
      .map((item) => normalizePubkey(item))
      .filter(isHexPubkey),
  )];
};

const chunkArray = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  const chunkSize = Math.max(1, size);
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
};

const collectFollowersFromEvents = (
  events: NostrEventLike[],
  targetPubkey: string,
  followers: Set<string>,
): { minCreatedAt: number } => {
  let minCreatedAt = Infinity;

  for (const event of events) {
    minCreatedAt = Math.min(minCreatedAt, event.created_at);
    const follows = parseFollowsFromKind3(event);
    if (!follows.includes(targetPubkey)) {
      continue;
    }

    followers.add(event.pubkey);
  }

  return { minCreatedAt };
};

export interface ContentServiceOptions {
  postsGateway?: RelayGateway<ContentPostsQuery, ContentPostsResponseDto>;
  profileStatsGateway?: RelayGateway<ProfileStatsQuery, ProfileStatsResponseDto>;
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
    return this.postsGateway.query({
      key: `content:posts:${normalizePubkey(query.pubkey)}:${query.limit}:${query.until ?? ''}`,
      params: query,
    });
  }

  async getProfileStats(query: ProfileStatsQuery): Promise<ProfileStatsResponseDto> {
    const candidateAuthors = parseCandidateAuthors(query.candidateAuthors);

    try {
      return await this.profileStatsGateway.query({
        key: `content:profile-stats:${normalizePubkey(query.pubkey)}:${candidateAuthors.join(',')}`,
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
    queryFn: (relays: string[]) => Promise<T>,
  ): Promise<T> => {
    const relaySets = resolveRelaySets({
      scopedRelays: [],
      userRelays: [],
      bootstrapRelays: options.bootstrapRelays,
    });

    if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary })) {
      return queryFn(relaySets.fallback);
    }

    try {
      return await queryFn(relaySets.primary);
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

    const events = await queryWithFallback(async (relays) => {
      if (relays.length === 0) {
        return [] as NostrEventLike[];
      }

      return options.pool.querySync(relays, {
        authors: [pubkey],
        kinds: [1],
        until,
        limit: query.limit + 1,
      }) as Promise<NostrEventLike[]>;
    });

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

    const followsResult = await queryWithFallback(async (relays) => {
      if (relays.length === 0) {
        return null;
      }

      const events = await options.pool.querySync(relays, {
        authors: [targetPubkey],
        kinds: [3],
        limit: 1,
      }) as NostrEventLike[];

      return [...events].sort(byCreatedAtDesc)[0] ?? null;
    });

    const followers = new Set<string>();
    await queryWithFallback(async (relays) => {
      if (relays.length === 0) {
        return;
      }

      let until: number | undefined;
      for (let batchIndex = 0; batchIndex < FOLLOWERS_TAG_MAX_BATCHES; batchIndex += 1) {
        const events = await options.pool.querySync(relays, {
          kinds: [3],
          '#p': [targetPubkey],
          until,
          limit: FOLLOWERS_TAG_BATCH_LIMIT,
        }) as NostrEventLike[];

        if (events.length === 0) {
          break;
        }

        const { minCreatedAt } = collectFollowersFromEvents(events, targetPubkey, followers);
        if (events.length < FOLLOWERS_TAG_BATCH_LIMIT) {
          break;
        }

        if (Number.isFinite(minCreatedAt)) {
          until = minCreatedAt - 1;
        }
      }

      for (const authors of chunkArray(candidateAuthors, CANDIDATE_AUTHOR_BATCH_SIZE)) {
        const events = await options.pool.querySync(relays, {
          kinds: [3],
          authors,
          limit: Math.max(FOLLOWERS_TAG_BATCH_LIMIT, authors.length * 3),
        }) as NostrEventLike[];

        collectFollowersFromEvents(events, targetPubkey, followers);
      }
    });

    return {
      followsCount: parseFollowsFromKind3(followsResult).length,
      followersCount: followers.size,
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
  const fetchers = createPoolFetchers({
    pool,
    bootstrapRelays,
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
