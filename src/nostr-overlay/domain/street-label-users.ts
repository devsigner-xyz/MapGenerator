import type { NostrProfile } from '../../nostr/types';

export interface StreetLabelUsersInput {
    occupancyByBuildingIndex: Record<number, string>;
    profiles: Record<string, NostrProfile>;
}

function sanitizeUsername(value?: string): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : undefined;
}

function resolveProfileUsername(profile?: NostrProfile): string | undefined {
    return sanitizeUsername(profile?.displayName) || sanitizeUsername(profile?.name);
}

export function extractStreetLabelUsernames(input: StreetLabelUsersInput): string[] {
    const keys = Object.keys(input.occupancyByBuildingIndex)
        .map((key) => Number(key))
        .filter((index) => Number.isInteger(index))
        .sort((left, right) => left - right);

    const usernames: string[] = [];
    const seen = new Set<string>();

    for (const index of keys) {
        const pubkey = input.occupancyByBuildingIndex[index];
        if (!pubkey) {
            continue;
        }

        const username = resolveProfileUsername(input.profiles[pubkey]);
        if (!username) {
            continue;
        }

        const dedupeKey = username.toLocaleLowerCase();
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        usernames.push(username);
    }

    return usernames;
}
