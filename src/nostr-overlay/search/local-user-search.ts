import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import type { SearchUsersResult } from '../query/user-search.query';

interface LocalUserSearchInput {
    query: string;
    ownerPubkey?: string | undefined;
    followedPubkeys: string[];
    profiles: Record<string, NostrProfile>;
    limit?: number;
}

interface RankedProfile {
    pubkey: string;
    profile: NostrProfile;
    matchQuality: 0 | 1 | 2 | 3;
    followed: boolean;
    localKnown: boolean;
}

function normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
}

function profileStrings(pubkey: string, profile: NostrProfile): string[] {
    const values = [
        profile.displayName,
        profile.name,
        profile.nip05,
        profile.about,
        profile.lud16,
        pubkey,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    try {
        values.push(encodeHexToNpub(pubkey));
    } catch {
        // Ignore invalid pubkeys in local search.
    }

    return values.map((value) => value.toLowerCase());
}

function matchQuality(query: string, values: string[]): RankedProfile['matchQuality'] {
    if (query.length === 0) {
        return 0;
    }

    if (values.some((value) => value === query)) {
        return 3;
    }

    if (values.some((value) => value.startsWith(query))) {
        return 2;
    }

    if (values.some((value) => value.includes(query))) {
        return 1;
    }

    return 0;
}

function rankProfiles(left: RankedProfile, right: RankedProfile): number {
    if (left.matchQuality !== right.matchQuality) {
        return right.matchQuality - left.matchQuality;
    }

    if (left.followed !== right.followed) {
        return left.followed ? -1 : 1;
    }

    const leftLabel = left.profile.displayName || left.profile.name || left.pubkey;
    const rightLabel = right.profile.displayName || right.profile.name || right.pubkey;
    return leftLabel.localeCompare(rightLabel);
}

export function searchLocalUsers(input: LocalUserSearchInput): SearchUsersResult {
    const normalizedQuery = normalizeQuery(input.query);
    const followedSet = new Set(input.followedPubkeys);
    const rankedProfiles: RankedProfile[] = [];
    const limit = input.limit ?? 20;

    for (const [pubkey, profile] of Object.entries(input.profiles)) {
        if (pubkey === input.ownerPubkey) {
            continue;
        }

        const values = profileStrings(pubkey, profile);
        const quality = normalizedQuery.length === 0 ? 1 : matchQuality(normalizedQuery, values);
        if (quality === 0) {
            continue;
        }

        rankedProfiles.push({
            pubkey,
            profile,
            matchQuality: quality,
            followed: followedSet.has(pubkey),
            localKnown: true,
        });
    }

    rankedProfiles.sort(rankProfiles);
    const selected = rankedProfiles.slice(0, limit);

    return {
        pubkeys: selected.map((entry) => entry.pubkey),
        profiles: Object.fromEntries(selected.map((entry) => [entry.pubkey, entry.profile])),
    };
}

export function mergeUserSearchResults(input: {
    local: SearchUsersResult;
    remote: SearchUsersResult;
    followedPubkeys: string[];
    query: string;
    limit?: number;
}): SearchUsersResult {
    const followedSet = new Set(input.followedPubkeys);
    const combinedProfiles: Record<string, NostrProfile> = { ...input.local.profiles };

    for (const [pubkey, profile] of Object.entries(input.remote.profiles)) {
        combinedProfiles[pubkey] = {
            ...(combinedProfiles[pubkey] ?? { pubkey }),
            ...profile,
        };
    }

    const normalizedQuery = normalizeQuery(input.query);
    const limit = input.limit ?? 20;
    const ranked = Object.entries(combinedProfiles)
        .map(([pubkey, profile]) => ({
            pubkey,
            profile,
            matchQuality: normalizedQuery.length === 0 ? 1 : matchQuality(normalizedQuery, profileStrings(pubkey, profile)),
            followed: followedSet.has(pubkey),
            localKnown: Object.prototype.hasOwnProperty.call(input.local.profiles, pubkey),
        }))
        .filter((entry) => entry.matchQuality > 0)
        .sort((left, right) => {
            if (left.matchQuality !== right.matchQuality) {
                return right.matchQuality - left.matchQuality;
            }

            if (left.followed !== right.followed) {
                return left.followed ? -1 : 1;
            }

            if (left.localKnown !== right.localKnown) {
                return left.localKnown ? -1 : 1;
            }

            const leftLabel = left.profile.displayName || left.profile.name || left.pubkey;
            const rightLabel = right.profile.displayName || right.profile.name || right.pubkey;
            return leftLabel.localeCompare(rightLabel);
        })
        .slice(0, limit);

    return {
        pubkeys: ranked.map((entry) => entry.pubkey),
        profiles: Object.fromEntries(ranked.map((entry) => [entry.pubkey, entry.profile])),
    };
}
