import type { NostrEvent } from './types';

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function safeJsonParse(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export function parseEventFromJson(value: string): NostrEvent | null {
    const parsed = safeJsonParse(value);
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    const event = parsed as {
        id?: unknown;
        sig?: unknown;
        pubkey?: unknown;
        kind?: unknown;
        created_at?: unknown;
        tags?: unknown;
        content?: unknown;
    };

    if (
        typeof event.id !== 'string' ||
        typeof event.pubkey !== 'string' ||
        typeof event.kind !== 'number' ||
        typeof event.created_at !== 'number' ||
        !Array.isArray(event.tags) ||
        typeof event.content !== 'string'
    ) {
        return null;
    }

    const normalizedTags = event.tags.filter(isStringArray);
    if (normalizedTags.length !== event.tags.length) {
        return null;
    }

    return {
        id: event.id,
        sig: typeof event.sig === 'string' ? event.sig : undefined,
        pubkey: event.pubkey,
        kind: event.kind,
        created_at: event.created_at,
        tags: normalizedTags,
        content: event.content,
    };
}

export function getSinglePTag(tags: string[][]): string | null {
    const pTags = tags.filter((tag) => tag[0] === 'p' && typeof tag[1] === 'string' && tag[1].length > 0);
    if (pTags.length !== 1) {
        return null;
    }

    return pTags[0][1];
}

export function hashContent(content: string): string {
    let hash = 2166136261;
    for (let index = 0; index < content.length; index += 1) {
        hash ^= content.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return `hash:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
