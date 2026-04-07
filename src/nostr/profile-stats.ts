import { fetchFollowersBestEffort } from './followers';
import { parseFollowsFromKind3 } from './follows';
import type { NostrClient } from './types';

export interface ProfileStats {
    followsCount: number;
    followersCount: number;
}

export async function fetchProfileStats(input: {
    pubkey: string;
    client: NostrClient;
    candidateAuthors?: string[];
}): Promise<ProfileStats> {
    const [kind3, followerDiscovery] = await Promise.all([
        input.client.fetchLatestReplaceableEvent(input.pubkey, 3),
        fetchFollowersBestEffort({
            targetPubkey: input.pubkey,
            client: input.client,
            candidateAuthors: input.candidateAuthors,
        }),
    ]);

    return {
        followsCount: kind3 ? parseFollowsFromKind3(kind3).length : 0,
        followersCount: followerDiscovery.followers.length,
    };
}
