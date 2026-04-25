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
  GraphFollowersQuery,
  GraphFollowersResponseDto,
  GraphFollowsQuery,
  GraphFollowsResponseDto,
} from './graph.schemas';

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

const parseRelayHintsFromKind3 = (event: NostrEventLike | null | undefined): string[] => {
  if (!event) {
    return [];
  }

  const hints = new Set<string>();
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag[0] !== 'p' || typeof tag[2] !== 'string') {
      continue;
    }

    const relay = tag[2].trim();
    if (relay.length > 0) {
      hints.add(relay);
    }
  }

  return [...hints];
};

const byCreatedAtDesc = (left: NostrEventLike, right: NostrEventLike): number => {
  if (left.created_at !== right.created_at) {
    return right.created_at - left.created_at;
  }

  return left.id.localeCompare(right.id);
};

function toScopedReadRelays(value?: string | string[]): string[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export interface GraphServiceOptions {
  followsGateway?: RelayGateway<GraphFollowsQuery, GraphFollowsResponseDto>;
  followersGateway?: RelayGateway<GraphFollowersQuery, GraphFollowersResponseDto>;
  authorRelayDirectory?: AuthorRelayDirectory;
  relayQueryPlanner?: RelayQueryPlanner;
  fetchFollows?: (
    query: GraphFollowsQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<GraphFollowsResponseDto>;
  fetchFollowers?: (
    query: GraphFollowersQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<GraphFollowersResponseDto>;
  defaultTimeoutMs?: number;
  bootstrapRelays?: string[];
  pool?: SimplePool;
}

export interface GraphService {
  getFollows(query: GraphFollowsQuery): Promise<GraphFollowsResponseDto>;
  getFollowers(query: GraphFollowersQuery): Promise<GraphFollowersResponseDto>;
}

class GatewayGraphService implements GraphService {
  constructor(
    private readonly followsGateway: RelayGateway<GraphFollowsQuery, GraphFollowsResponseDto>,
    private readonly followersGateway: RelayGateway<GraphFollowersQuery, GraphFollowersResponseDto>,
  ) {}

  async getFollows(query: GraphFollowsQuery): Promise<GraphFollowsResponseDto> {
    const scopedRelaySetKey = relaySetKey(toScopedReadRelays(query.scopedReadRelays));
    const pubkey = normalizePubkey(query.pubkey);

    try {
      return await this.followsGateway.query({
        key: `graph:follows:${pubkey}:${scopedRelaySetKey}`,
        params: query,
      });
    } catch {
      return {
        pubkey,
        follows: [],
        relayHints: [],
      };
    }
  }

  async getFollowers(query: GraphFollowersQuery): Promise<GraphFollowersResponseDto> {
    const candidateAuthors = parseCandidateAuthors(query.candidateAuthors);
    const scopedRelaySetKey = relaySetKey(toScopedReadRelays(query.scopedReadRelays));

    try {
      return await this.followersGateway.query({
        key: `graph:followers:${normalizePubkey(query.pubkey)}:${candidateAuthors.join(',')}:${scopedRelaySetKey}`,
        params: query,
      });
    } catch {
      return {
        pubkey: normalizePubkey(query.pubkey),
        followers: [],
        complete: false,
      };
    }
  }
}

const createPoolFetchers = (options: {
  pool: SimplePool;
  bootstrapRelays: string[];
  relayQueryPlanner: RelayQueryPlanner;
}): {
  fetchFollows: (
    query: GraphFollowsQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<GraphFollowsResponseDto>;
  fetchFollowers: (
    query: GraphFollowersQuery,
    context: RelayGatewayQueryContext,
  ) => Promise<GraphFollowersResponseDto>;
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

  const fetchFollows = async (
    query: GraphFollowsQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<GraphFollowsResponseDto> => {
    const pubkey = normalizePubkey(query.pubkey);
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
        kinds: [3],
        limit: 1,
      }) as Promise<NostrEventLike[]>;
    }, (events) => events.length === 0);

    const latest = [...events].sort(byCreatedAtDesc)[0] ?? null;
    return {
      pubkey,
      follows: parseFollowsFromKind3(latest),
      relayHints: parseRelayHintsFromKind3(latest),
    };
  };

  const fetchFollowers = async (
    query: GraphFollowersQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<GraphFollowersResponseDto> => {
    const targetPubkey = normalizePubkey(query.pubkey);
    const candidateAuthors = parseCandidateAuthors(query.candidateAuthors)
      .filter((author) => author !== targetPubkey);
    const plan = await options.relayQueryPlanner.planFollowers({
      scopedReadRelays: toScopedReadRelays(query.scopedReadRelays),
      targetPubkey,
      candidateAuthors,
    });
    const discovery = await discoverFollowers({
      targetPubkey,
      ownerScope: plan.ownerScope,
      candidateAuthorScopes: plan.candidateAuthorScopes,
      queryEvents: async (relays, filter) => {
        return options.pool.querySync(relays, filter) as Promise<NostrEventLike[]>;
      },
    });

    return {
      pubkey: targetPubkey,
      followers: discovery.followers,
      complete: discovery.ownerScopeComplete && discovery.candidateScopesComplete,
    };
  };

  return {
    fetchFollows,
    fetchFollowers,
  };
};

export const createGraphService = (options: GraphServiceOptions = {}): GraphService => {
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

  const followsGateway =
    options.followsGateway
    ?? createRelayGateway<GraphFollowsQuery, GraphFollowsResponseDto>({
      queryFn: options.fetchFollows ?? fetchers.fetchFollows,
      defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_RELAY_QUERY_TIMEOUT_MS,
      cache: {
        ttlMs: 10_000,
        maxEntries: 500,
      },
    });

  const followersGateway =
    options.followersGateway
    ?? createRelayGateway<GraphFollowersQuery, GraphFollowersResponseDto>({
      queryFn: options.fetchFollowers ?? fetchers.fetchFollowers,
      defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_RELAY_QUERY_TIMEOUT_MS,
      cache: {
        ttlMs: 10_000,
        maxEntries: 500,
      },
    });

  return new GatewayGraphService(followsGateway, followersGateway);
};
