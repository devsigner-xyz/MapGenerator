import type { NostrEvent } from './types';

const DEFAULT_BOOTSTRAP_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
] as const;

export interface RelaySuggestionsByType {
    nip65Both: string[];
    nip65Read: string[];
    nip65Write: string[];
}

const EMPTY_SUGGESTIONS: RelaySuggestionsByType = {
    nip65Both: [],
    nip65Read: [],
    nip65Write: [],
};

export function normalizeRelayUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
            return null;
        }

        parsed.hash = '';
        parsed.search = '';
        const normalized = parsed.toString();
        return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    } catch {
        return null;
    }
}

export function getBootstrapRelays(): string[] {
    return [...DEFAULT_BOOTSTRAP_RELAYS];
}

export function mergeRelaySets(...relaySets: string[][]): string[] {
    const merged = new Set<string>();
    for (const relaySet of relaySets) {
        for (const relay of relaySet) {
            const normalized = normalizeRelayUrl(relay);
            if (normalized) {
                merged.add(normalized);
            }
        }
    }
    return [...merged];
}

export function relayHintsFromKind3Content(content: string): string[] {
    if (!content) {
        return [];
    }

    try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') {
            return [];
        }

        return Object.keys(parsed)
            .map((relay) => normalizeRelayUrl(relay))
            .filter((relay): relay is string => relay !== null);
    } catch {
        return [];
    }
}

export function relayListFromKind10002Event(event: NostrEvent | null): string[] {
    const typed = relaySuggestionsByTypeFromKind10002Event(event);
    return mergeRelaySets(typed.nip65Both, typed.nip65Read, typed.nip65Write);
}

export function relaySuggestionsByTypeFromKind10002Event(event: NostrEvent | null): RelaySuggestionsByType {
    if (!event || event.kind !== 10002) {
        return EMPTY_SUGGESTIONS;
    }

    const nip65Both: string[] = [];
    const nip65Read: string[] = [];
    const nip65Write: string[] = [];

    for (const tag of event.tags) {
        if (tag[0] !== 'r' || typeof tag[1] !== 'string' || tag[1].length === 0) {
            continue;
        }

        const relayUrl = tag[1];
        const marker = typeof tag[2] === 'string' ? tag[2].toLowerCase() : '';

        if (marker === 'read') {
            nip65Read.push(relayUrl);
            continue;
        }

        if (marker === 'write') {
            nip65Write.push(relayUrl);
            continue;
        }

        nip65Both.push(relayUrl);
        nip65Read.push(relayUrl);
        nip65Write.push(relayUrl);
    }

    return {
        nip65Both: mergeRelaySets(nip65Both),
        nip65Read: mergeRelaySets(nip65Read),
        nip65Write: mergeRelaySets(nip65Write),
    };
}

export function dmInboxRelayListFromKind10050Event(event: NostrEvent | null): string[] {
    if (!event || event.kind !== 10050) {
        return [];
    }

    const relays: string[] = [];
    for (const tag of event.tags) {
        if (tag[0] !== 'relay' || typeof tag[1] !== 'string' || tag[1].length === 0) {
            continue;
        }

        relays.push(tag[1]);
    }

    return mergeRelaySets(relays);
}
