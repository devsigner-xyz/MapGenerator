import { SimplePool } from 'nostr-tools';

import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { createRelayGateway } from '../../relay/relay-gateway';
import type {
  RelayGateway,
  RelayGatewayQueryContext,
} from '../../relay/relay-gateway.types';
import { resolveRelaySets } from '../../relay/relay-resolver';
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

const HEX_64_REGEX = /^[0-9a-f]{64}$/;
const FOLLOWERS_TAG_BATCH_LIMIT = 120;
const FOLLOWERS_TAG_MAX_BATCHES = 3;
const CANDIDATE_AUTHOR_BATCH_SIZE = 40;
const DEFAULT_RELAY_QUERY_TIMEOUT_MS = 7_000;

const normalizePubkey = (value: string): string => value.trim().toLowerCase();

const isHexPubkey = (value: string): boolean => HEX_64_REGEX.test(value);

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

const byCreatedAtDesc = (left: NostrEventLike, right: NostrEventLike): number => {
  if (left.created_at !== right.created_at) {
    return right.created_at - left.created_at;
  }

  return left.id.localeCompare(right.id);
};

const collectFollowersFromEvents = (
  events: NostrEventLike[],
  targetPubkey: string,
  followers: Set<string>,
): { minCreatedAt: number; didAdd: boolean } => {
  let minCreatedAt = Infinity;
  let didAdd = false;

  for (const event of events) {
    minCreatedAt = Math.min(minCreatedAt, event.created_at);
    const follows = parseFollowsFromKind3(event);
    if (!follows.includes(targetPubkey)) {
      continue;
    }

    if (followers.has(event.pubkey)) {
      continue;
    }

    followers.add(event.pubkey);
    didAdd = true;
  }

  return {
    minCreatedAt,
    didAdd,
  };
};

export interface GraphServiceOptions {
  followsGateway?: RelayGateway<GraphFollowsQuery, GraphFollowsResponseDto>;
  followersGateway?: RelayGateway<GraphFollowersQuery, GraphFollowersResponseDto>;
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
    return this.followsGateway.query({
      key: `graph:follows:${normalizePubkey(query.pubkey)}`,
      params: query,
    });
  }

  async getFollowers(query: GraphFollowersQuery): Promise<GraphFollowersResponseDto> {
    const candidateAuthors = parseCandidateAuthors(query.candidateAuthors);

    try {
      return await this.followersGateway.query({
        key: `graph:followers:${normalizePubkey(query.pubkey)}:${candidateAuthors.join(',')}`,
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

  const fetchFollows = async (
    query: GraphFollowsQuery,
    _context: RelayGatewayQueryContext,
  ): Promise<GraphFollowsResponseDto> => {
    const pubkey = normalizePubkey(query.pubkey);
    const events = await queryWithFallback(async (relays) => {
      if (relays.length === 0) {
        return [] as NostrEventLike[];
      }

      return options.pool.querySync(relays, {
        authors: [pubkey],
        kinds: [3],
        limit: 1,
      }) as Promise<NostrEventLike[]>;
    });

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
    const followers = new Set<string>();
    let until: number | undefined;
    let complete = false;

    try {
      await queryWithFallback(async (relays) => {
        if (relays.length === 0) {
          complete = true;
          return;
        }

        for (let batchIndex = 0; batchIndex < FOLLOWERS_TAG_MAX_BATCHES; batchIndex += 1) {
          const events = await options.pool.querySync(relays, {
            kinds: [3],
            '#p': [targetPubkey],
            until,
            limit: FOLLOWERS_TAG_BATCH_LIMIT,
          }) as NostrEventLike[];

          if (events.length === 0) {
            complete = true;
            break;
          }

          const { minCreatedAt } = collectFollowersFromEvents(events, targetPubkey, followers);
          if (events.length < FOLLOWERS_TAG_BATCH_LIMIT) {
            complete = true;
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
    } catch {
      complete = false;
    }

    return {
      pubkey: targetPubkey,
      followers: [...followers].sort((left, right) => left.localeCompare(right)),
      complete,
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
  const fetchers = createPoolFetchers({
    pool,
    bootstrapRelays,
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
