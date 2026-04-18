import type { LoginMethod } from './session';

export const AUTH_SESSION_STORAGE_KEY = 'nostr.overlay.auth.session.v1';

const STORED_AUTH_METHODS = new Set(['npub', 'nip07', 'nip46', 'local', 'nsec']);

type StoredAuthMethod = LoginMethod | 'nsec';

export interface StoredAuthSession {
    method: StoredAuthMethod;
    pubkey: string;
    readonly: boolean;
    locked: boolean;
    createdAt: number;
}

function isStoredAuthMethod(value: unknown): value is StoredAuthMethod {
    return typeof value === 'string' && STORED_AUTH_METHODS.has(value);
}

function getDefaultStorage(): Storage | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }

    return window.localStorage;
}

function isStoredAuthSession(value: unknown): value is StoredAuthSession {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<StoredAuthSession>;
    if (!isStoredAuthMethod(candidate.method)) {
        return false;
    }

    if (typeof candidate.pubkey !== 'string') {
        return false;
    }

    if (typeof candidate.readonly !== 'boolean') {
        return false;
    }

    if (typeof candidate.locked !== 'boolean') {
        return false;
    }

    if (typeof candidate.createdAt !== 'number') {
        return false;
    }

    return true;
}

function sanitizeStoredSession(input: StoredAuthSession): StoredAuthSession {
    return {
        method: input.method,
        pubkey: input.pubkey,
        readonly: input.readonly,
        locked: input.locked,
        createdAt: input.createdAt,
    };
}

export function saveStoredAuthSession(
    session: StoredAuthSession,
    storage: Storage | undefined = getDefaultStorage()
): StoredAuthSession {
    const sanitized = sanitizeStoredSession(session);

    if (storage) {
        storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sanitized));
    }

    return sanitized;
}

export function loadStoredAuthSession(storage: Storage | undefined = getDefaultStorage()): StoredAuthSession | undefined {
    if (!storage) {
        return undefined;
    }

    const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isStoredAuthSession(parsed)) {
            storage.removeItem(AUTH_SESSION_STORAGE_KEY);
            return undefined;
        }

        return sanitizeStoredSession(parsed);
    } catch {
        storage.removeItem(AUTH_SESSION_STORAGE_KEY);
        return undefined;
    }
}

export function clearStoredAuthSession(storage: Storage | undefined = getDefaultStorage()): void {
    storage?.removeItem(AUTH_SESSION_STORAGE_KEY);
}
