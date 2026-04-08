import featuredOccupants from '../../data/featured-occupant-labels.json';
import { decodeNpubToHex } from '../../nostr/npub';

interface FeaturedOccupantEntry {
    npub?: unknown;
}

interface FeaturedOccupantsConfig {
    accounts?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeNpub(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function decodeFeaturedNpub(value: string): string | null {
    try {
        return decodeNpubToHex(value);
    } catch {
        return null;
    }
}

export function extractFeaturedOccupantPubkeys(input: unknown): string[] {
    if (!isRecord(input)) {
        return [];
    }

    const config = input as FeaturedOccupantsConfig;
    if (!Array.isArray(config.accounts)) {
        return [];
    }

    const pubkeys: string[] = [];
    const seen = new Set<string>();

    for (const entry of config.accounts as FeaturedOccupantEntry[]) {
        const npub = normalizeNpub(entry?.npub);
        if (!npub) {
            continue;
        }

        const pubkey = decodeFeaturedNpub(npub);
        if (!pubkey || seen.has(pubkey)) {
            continue;
        }

        seen.add(pubkey);
        pubkeys.push(pubkey);
    }

    return pubkeys;
}

export const FEATURED_OCCUPANT_PUBKEYS = extractFeaturedOccupantPubkeys(featuredOccupants);
