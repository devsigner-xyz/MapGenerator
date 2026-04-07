import { decodeNpubToHex } from './npub';
import { relayHintsFromKind3Content } from './relay-policy';
import type { FollowGraphResult, NostrClient, NostrEvent } from './types';

function isHexPubkey(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value);
}

export function parseFollowsFromKind3(event: NostrEvent): string[] {
    if (event.kind !== 3) {
        return [];
    }

    const follows = new Set<string>();
    for (const tag of event.tags) {
        if (tag[0] !== 'p') {
            continue;
        }

        const pubkey = tag[1];
        if (isHexPubkey(pubkey)) {
            follows.add(pubkey);
        }
    }

    return [...follows];
}

function relayHintsFromKind3Event(event: NostrEvent): string[] {
    const fromTags = event.tags
        .filter((tag) => tag[0] === 'p' && typeof tag[2] === 'string' && tag[2].length > 0)
        .map((tag) => tag[2]);

    return [...new Set([...fromTags, ...relayHintsFromKind3Content(event.content)])];
}

export async function fetchFollowsByNpub(npub: string, client: NostrClient): Promise<FollowGraphResult> {
    const ownerPubkey = decodeNpubToHex(npub);
    await client.connect();

    const kind3 = await client.fetchLatestReplaceableEvent(ownerPubkey, 3);
    if (!kind3) {
        return {
            ownerPubkey,
            follows: [],
            relayHints: [],
        };
    }

    return {
        ownerPubkey,
        follows: parseFollowsFromKind3(kind3),
        relayHints: relayHintsFromKind3Event(kind3),
    };
}
