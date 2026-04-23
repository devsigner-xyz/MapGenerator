import type { Filter } from 'nostr-tools';

import { shouldUseFallbackRelays } from './relay-fallback';
import type { CandidateAuthorScopePlan, RelayScopePlan } from './relay-query-planner';

type NostrEventLike = {
  id: string;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
};

const HEX_64_REGEX = /^[0-9a-f]{64}$/;
const FOLLOWERS_TAG_BATCH_LIMIT = 120;
const FOLLOWERS_TAG_MAX_BATCHES = 3;
const CANDIDATE_AUTHOR_BATCH_SIZE = 40;

const normalizePubkey = (value: string): string => value.trim().toLowerCase();

const isHexPubkey = (value: string): boolean => HEX_64_REGEX.test(value);

export const parseCandidateAuthors = (value?: string): string[] => {
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

export const parseFollowsFromKind3 = (event: NostrEventLike | null | undefined): string[] => {
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

const chunkArray = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  const chunkSize = Math.max(1, size);
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
};

export const collectFollowersFromEvents = (
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

export interface DiscoverFollowersInput {
  targetPubkey: string;
  ownerScope: RelayScopePlan;
  candidateAuthorScopes: CandidateAuthorScopePlan[];
  queryEvents: (relays: string[], filter: Filter) => Promise<NostrEventLike[]>;
}

export interface DiscoverFollowersResult {
  followers: string[];
  ownerScopeComplete: boolean;
  candidateScopesComplete: boolean;
}

async function scanFollowersByTargetTag(
  relays: string[],
  targetPubkey: string,
  queryEvents: DiscoverFollowersInput['queryEvents'],
  followers: Set<string>,
): Promise<{ complete: boolean; foundAny: boolean }> {
  if (relays.length === 0) {
    return { complete: true, foundAny: false };
  }

  let until: number | undefined;
  let foundAny = false;
  for (let batchIndex = 0; batchIndex < FOLLOWERS_TAG_MAX_BATCHES; batchIndex += 1) {
    const events = await queryEvents(relays, {
      kinds: [3],
      '#p': [targetPubkey],
      until,
      limit: FOLLOWERS_TAG_BATCH_LIMIT,
    });

    if (events.length === 0) {
      return { complete: true, foundAny };
    }

    foundAny = true;

    const { minCreatedAt } = collectFollowersFromEvents(events, targetPubkey, followers);
    if (events.length < FOLLOWERS_TAG_BATCH_LIMIT) {
      return { complete: true, foundAny };
    }

    if (Number.isFinite(minCreatedAt)) {
      until = minCreatedAt - 1;
    }
  }

  return { complete: false, foundAny };
}

async function scanWithFallback(
  scope: RelayScopePlan,
  targetPubkey: string,
  queryEvents: DiscoverFollowersInput['queryEvents'],
  followers: Set<string>,
): Promise<boolean> {
  if (shouldUseFallbackRelays({ primaryRelays: scope.primary })) {
    try {
      return (await scanFollowersByTargetTag(scope.fallback, targetPubkey, queryEvents, followers)).complete;
    } catch {
      return false;
    }
  }

  try {
    const primaryResult = await scanFollowersByTargetTag(scope.primary, targetPubkey, queryEvents, followers);
    if (scope.fallback.length > 0 && !primaryResult.foundAny) {
      try {
        return (await scanFollowersByTargetTag(scope.fallback, targetPubkey, queryEvents, followers)).complete;
      } catch {
        return false;
      }
    }

    return primaryResult.complete;
  } catch (error) {
    if (!shouldUseFallbackRelays({ primaryRelays: scope.primary, error })) {
      return false;
    }

    try {
      return (await scanFollowersByTargetTag(scope.fallback, targetPubkey, queryEvents, followers)).complete;
    } catch {
      return false;
    }
  }
}

export async function discoverFollowers(
  input: DiscoverFollowersInput,
): Promise<DiscoverFollowersResult> {
  const targetPubkey = normalizePubkey(input.targetPubkey);
  const followers = new Set<string>();
  const ownerScopeComplete = await scanWithFallback(
    input.ownerScope,
    targetPubkey,
    input.queryEvents,
    followers,
  );

  let candidateScopesComplete = true;
  for (const scope of input.candidateAuthorScopes) {
    if (scope.relays.length === 0 || scope.authors.length === 0) {
      continue;
    }

    for (const authors of chunkArray(scope.authors, CANDIDATE_AUTHOR_BATCH_SIZE)) {
      try {
        const events = await input.queryEvents(scope.relays, {
          kinds: [3],
          authors,
          limit: Math.max(FOLLOWERS_TAG_BATCH_LIMIT, authors.length * 3),
        });
        collectFollowersFromEvents(events, targetPubkey, followers);
      } catch {
        const candidateFallbackRelays = scope.fallbackRelays.filter((relay) => !scope.relays.includes(relay));
        if (candidateFallbackRelays.length === 0) {
          candidateScopesComplete = false;
          continue;
        }

        try {
          const events = await input.queryEvents(candidateFallbackRelays, {
            kinds: [3],
            authors,
            limit: Math.max(FOLLOWERS_TAG_BATCH_LIMIT, authors.length * 3),
          });
          collectFollowersFromEvents(events, targetPubkey, followers);
        } catch {
          candidateScopesComplete = false;
        }
      }
    }
  }

  return {
    followers: [...followers].sort((left, right) => left.localeCompare(right)),
    ownerScopeComplete,
    candidateScopesComplete,
  };
}
