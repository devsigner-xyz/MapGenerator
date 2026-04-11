import { createTtlCache } from './cache';
import { decodeNpubToHex, isHexKey } from './npub';
import { parseProfileMetadata } from './profiles';
import type { NostrClient, NostrEvent, NostrProfile } from './types';

const userSearchCache = createTtlCache<UserSearchResult>({
    ttlMs: 20_000,
    maxEntries: 300,
});

interface SearchProfileEntry {
    createdAt: number;
    profile: NostrProfile;
}

export interface UserSearchResult {
    pubkeys: string[];
    profiles: Record<string, NostrProfile>;
}

export interface SearchUsersInput {
    query: string;
    client: NostrClient;
    limit?: number;
    cacheKeyScope?: string;
}

export function __resetUserSearchCacheForTests(): void {
    userSearchCache.clear();
}

function extractExactPubkeys(query: string): string[] {
    const normalized = query.trim();
    if (!normalized) {
        return [];
    }

    const exact = new Set<string>();
    const lowered = normalized.toLowerCase();

    if (isHexKey(lowered)) {
        exact.add(lowered);
    }

    try {
        exact.add(decodeNpubToHex(normalized));
    } catch {
        // noop
    }

    return [...exact];
}

function mergeLatestProfiles(target: Map<string, SearchProfileEntry>, events: NostrEvent[]): void {
    for (const event of events) {
        if (event.kind !== 0) {
            continue;
        }

        const existing = target.get(event.pubkey);
        if (existing && existing.createdAt >= event.created_at) {
            continue;
        }

        target.set(event.pubkey, {
            createdAt: event.created_at,
            profile: parseProfileMetadata(event),
        });
    }
}

function buildResult(
    exactPubkeys: string[],
    latestProfilesByPubkey: Map<string, SearchProfileEntry>,
    limit: number
): UserSearchResult {
    const orderedExact = [...exactPubkeys];
    const rankedByRecency = [...latestProfilesByPubkey.entries()]
        .sort((left, right) => right[1].createdAt - left[1].createdAt)
        .map(([pubkey]) => pubkey);

    const pubkeys = [...new Set([...orderedExact, ...rankedByRecency])].slice(0, limit);
    const profiles: Record<string, NostrProfile> = {};

    for (const pubkey of pubkeys) {
        const fromMetadata = latestProfilesByPubkey.get(pubkey)?.profile;
        profiles[pubkey] = fromMetadata ?? { pubkey };
    }

    return {
        pubkeys,
        profiles,
    };
}

export async function searchUsers(input: SearchUsersInput): Promise<UserSearchResult> {
    const query = input.query.trim();
    if (!query) {
        return {
            pubkeys: [],
            profiles: {},
        };
    }

    const limit = Math.max(1, Math.floor(input.limit ?? 20));
    const exactPubkeys = extractExactPubkeys(query);
    const cacheKey = `user-search:${input.cacheKeyScope ?? 'default'}:${query.toLowerCase()}:${limit}`;

    return userSearchCache.getOrLoad(cacheKey, async () => {
        const latestProfilesByPubkey = new Map<string, SearchProfileEntry>();

        try {
            await input.client.connect();

            if (query.length >= 2) {
                const searchEvents = await input.client.fetchEvents({
                    kinds: [0],
                    search: query,
                    limit: Math.max(limit * 3, 30),
                });
                mergeLatestProfiles(latestProfilesByPubkey, searchEvents);
            }

            if (exactPubkeys.length > 0) {
                const exactEvents = await input.client.fetchEvents({
                    authors: exactPubkeys,
                    kinds: [0],
                    limit: Math.max(exactPubkeys.length * 2, 2),
                });
                mergeLatestProfiles(latestProfilesByPubkey, exactEvents);
            }
        } catch {
            // Keep exact fallback and any already merged profile data.
        }

        return buildResult(exactPubkeys, latestProfilesByPubkey, limit);
    });
}
