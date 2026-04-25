import { canonicalRelaySet, relaySetKey, resolveRelaySets } from './relay-resolver';
import { selectReadRelays, type AuthorRelayDirectory } from './author-relay-directory';

export interface RelayScopePlan {
  primary: string[];
  fallback: string[];
}

export interface CandidateAuthorScopePlan {
  authors: string[];
  relays: string[];
  fallbackRelays: string[];
}

export interface RelayQueryPlanner {
  planPosts(input: {
    scopedReadRelays?: string[];
    targetPubkey: string;
  }): Promise<RelayScopePlan>;
  planFollowers(input: {
    scopedReadRelays?: string[];
    targetPubkey: string;
    candidateAuthors: string[];
  }): Promise<{
    ownerScope: RelayScopePlan;
    candidateAuthorScopes: CandidateAuthorScopePlan[];
  }>;
}

export interface CreateRelayQueryPlannerOptions {
  bootstrapRelays: string[];
  authorRelayDirectory: AuthorRelayDirectory;
  maxAuthorRelays?: number;
}

const MAX_AUTHOR_RELAYS = 3;
const MAX_CONCURRENT_AUTHOR_RELAY_LOOKUPS = 4;

function canonicalizeScopePlan(scope: RelayScopePlan): RelayScopePlan {
  return {
    primary: canonicalRelaySet(scope.primary),
    fallback: canonicalRelaySet(scope.fallback),
  };
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  limit: number,
  mapper: (value: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  const workerCount = Math.min(Math.max(1, limit), values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function createRelayQueryPlanner(
  options: CreateRelayQueryPlannerOptions,
): RelayQueryPlanner {
  const bootstrapRelays = canonicalRelaySet(options.bootstrapRelays);
  const maxAuthorRelays = Math.max(1, options.maxAuthorRelays ?? MAX_AUTHOR_RELAYS);

  return {
    async planPosts(input) {
      const readRelays = await selectReadRelays({
        authors: [input.targetPubkey],
        scopedReadRelays: input.scopedReadRelays,
        bootstrapRelays,
        authorRelayDirectory: options.authorRelayDirectory,
      });
      const hasScopedReadRelays = canonicalRelaySet(input.scopedReadRelays ?? []).length > 0;
      const primaryReadRelays = !hasScopedReadRelays && relaySetKey(readRelays) === relaySetKey(bootstrapRelays)
        ? []
        : readRelays;

      return canonicalizeScopePlan(resolveRelaySets({
        scopedRelays: primaryReadRelays,
        userRelays: [],
        bootstrapRelays,
      }));
    },

    async planFollowers(input) {
      const ownerScope = canonicalizeScopePlan(resolveRelaySets({
        scopedRelays: input.scopedReadRelays ?? [],
        userRelays: [],
        bootstrapRelays,
      }));
      const groupedScopes = new Map<string, CandidateAuthorScopePlan>();

      const fallbackCandidateRelays = bootstrapRelays;
      const candidatePlans = await mapWithConcurrency(
        input.candidateAuthors,
        MAX_CONCURRENT_AUTHOR_RELAY_LOOKUPS,
        async (author) => {
        if (author === input.targetPubkey) {
          return null;
        }

        try {
          const relays = canonicalRelaySet(await options.authorRelayDirectory.getAuthorWriteRelays(author))
            .slice(0, maxAuthorRelays);
          return {
            author,
            relays: relays.length > 0 ? relays : fallbackCandidateRelays,
          };
        } catch {
          return {
            author,
            relays: fallbackCandidateRelays,
          };
        }
        },
      );

      for (const candidatePlan of candidatePlans) {
        if (!candidatePlan) {
          continue;
        }

        const { author, relays } = candidatePlan;
        if (relays.length === 0) {
          continue;
        }

        const key = relaySetKey(relays);
        const existing = groupedScopes.get(key);
        if (existing) {
          existing.authors.push(author);
          continue;
        }

        groupedScopes.set(key, {
          authors: [author],
          relays,
          fallbackRelays: fallbackCandidateRelays,
        });
      }

      return {
        ownerScope,
        candidateAuthorScopes: [...groupedScopes.values()],
      };
    },
  };
}
