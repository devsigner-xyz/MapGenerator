import type { NostrEvent } from './types';

const DEFAULT_BOOTSTRAP_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
] as const;

export interface RelaySuggestionsByType {
    general: string[];
    dmInbox: string[];
    dmOutbox: string[];
}

const EMPTY_SUGGESTIONS: RelaySuggestionsByType = {
    general: [],
    dmInbox: [],
    dmOutbox: [],
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
    return mergeRelaySets(typed.general, typed.dmInbox, typed.dmOutbox);
}

export function relaySuggestionsByTypeFromKind10002Event(event: NostrEvent | null): RelaySuggestionsByType {
    if (!event || event.kind !== 10002) {
        return EMPTY_SUGGESTIONS;
    }

    const general: string[] = [];
    const dmInbox: string[] = [];
    const dmOutbox: string[] = [];

    for (const tag of event.tags) {
        if (tag[0] !== 'r' || typeof tag[1] !== 'string' || tag[1].length === 0) {
            continue;
        }

        const relayUrl = tag[1];
        const marker = typeof tag[2] === 'string' ? tag[2].toLowerCase() : '';

        general.push(relayUrl);
        if (marker === 'read') {
            dmInbox.push(relayUrl);
            continue;
        }

        if (marker === 'write') {
            dmOutbox.push(relayUrl);
            continue;
        }

        dmInbox.push(relayUrl);
        dmOutbox.push(relayUrl);
    }

    return {
        general: mergeRelaySets(general),
        dmInbox: mergeRelaySets(dmInbox),
        dmOutbox: mergeRelaySets(dmOutbox),
    };
}
