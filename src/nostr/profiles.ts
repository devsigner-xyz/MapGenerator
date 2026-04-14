import { createTtlCache } from './cache';
import type { NostrClient, NostrEvent, NostrProfile } from './types';

const profileCache = createTtlCache<NostrProfile | null>({
    ttlMs: 5 * 60_000,
    maxEntries: 5000,
});

export function __resetProfileCacheForTests(): void {
    profileCache.clear();
}

interface MetadataContent {
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    nip05?: string;
    lud16?: string;
    lud06?: string;
    bot?: boolean;
    github?: string;
    twitter?: string;
    mastodon?: string;
    telegram?: string;
}

function extractExternalIdentities(parsed: MetadataContent): string[] | undefined {
    const identities = [
        parsed.github ? `github:${parsed.github}` : null,
        parsed.twitter ? `twitter:${parsed.twitter}` : null,
        parsed.mastodon ? `mastodon:${parsed.mastodon}` : null,
        parsed.telegram ? `telegram:${parsed.telegram}` : null,
    ].filter((value): value is string => Boolean(value));

    if (identities.length === 0) {
        return undefined;
    }

    return [...new Set(identities)];
}

export function parseProfileMetadata(event: NostrEvent): NostrProfile {
    let parsed: MetadataContent = {};

    try {
        parsed = JSON.parse(event.content) as MetadataContent;
    } catch {
        parsed = {};
    }

    return {
        pubkey: event.pubkey,
        name: parsed.name,
        displayName: parsed.display_name,
        about: parsed.about,
        picture: parsed.picture,
        banner: parsed.banner,
        website: parsed.website,
        nip05: parsed.nip05,
        lud16: parsed.lud16,
        lud06: parsed.lud06,
        bot: parsed.bot,
        externalIdentities: extractExternalIdentities(parsed),
    };
}

export async function fetchProfiles(pubkeys: string[], client: NostrClient): Promise<Record<string, NostrProfile>> {
    if (pubkeys.length === 0) {
        return {};
    }

    const uniquePubkeys = [...new Set(pubkeys)];
    const profiles: Record<string, NostrProfile> = {};
    const missingPubkeys: string[] = [];

    for (const pubkey of uniquePubkeys) {
        const cached = profileCache.get(`profile:${pubkey}`);
        if (cached === undefined) {
            missingPubkeys.push(pubkey);
            continue;
        }

        if (cached !== null) {
            profiles[pubkey] = cached;
        }
    }

    if (missingPubkeys.length === 0) {
        return profiles;
    }

    await client.connect();
    const events = await client.fetchEvents({
        authors: missingPubkeys,
        kinds: [0],
        limit: missingPubkeys.length * 2,
    });

    const latestByPubkey = new Map<string, NostrEvent>();
    for (const event of events) {
        const existing = latestByPubkey.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
            latestByPubkey.set(event.pubkey, event);
        }
    }

    for (const pubkey of missingPubkeys) {
        const latest = latestByPubkey.get(pubkey);
        if (!latest) {
            profileCache.set(`profile:${pubkey}`, null);
            continue;
        }

        const parsed = parseProfileMetadata(latest);
        profileCache.set(`profile:${pubkey}`, parsed);
        profiles[pubkey] = parsed;
    }

    return profiles;
}
