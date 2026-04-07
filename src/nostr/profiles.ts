import type { NostrClient, NostrEvent, NostrProfile } from './types';

interface MetadataContent {
    name?: string;
    display_name?: string;
    picture?: string;
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
        picture: parsed.picture,
    };
}

export async function fetchProfiles(pubkeys: string[], client: NostrClient): Promise<Record<string, NostrProfile>> {
    if (pubkeys.length === 0) {
        return {};
    }

    await client.connect();
    const events = await client.fetchEvents({
        authors: pubkeys,
        kinds: [0],
        limit: pubkeys.length * 2,
    });

    const latestByPubkey = new Map<string, NostrEvent>();
    for (const event of events) {
        const existing = latestByPubkey.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
            latestByPubkey.set(event.pubkey, event);
        }
    }

    const profiles: Record<string, NostrProfile> = {};
    for (const [pubkey, event] of latestByPubkey) {
        profiles[pubkey] = parseProfileMetadata(event);
    }

    return profiles;
}
