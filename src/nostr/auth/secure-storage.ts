import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import type { LoginMethod } from './session';

export const AUTH_SESSION_STORAGE_KEY = 'nostr.overlay.auth.session.v1';

export interface StoredAuthSession {
    method: LoginMethod;
    pubkey: string;
    readonly: boolean;
    locked: boolean;
    createdAt: number;
    ncryptsec?: string;
}

interface UnlockSessionResult {
    session: StoredAuthSession;
    privateKeyHex: string;
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
    if (typeof candidate.method !== 'string') {
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

    if (candidate.ncryptsec !== undefined && typeof candidate.ncryptsec !== 'string') {
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
        ncryptsec: input.ncryptsec,
    };
}

export function encryptPrivateKeyToNcryptsec(privateKeyOrNsec: string, passphrase: string): string {
    const signer = new NDKPrivateKeySigner(privateKeyOrNsec);
    return signer.encryptToNcryptsec(passphrase);
}

export function decryptPrivateKeyFromNcryptsec(ncryptsec: string, passphrase: string): string {
    const signer = NDKPrivateKeySigner.fromNcryptsec(ncryptsec, passphrase);
    return signer.privateKey;
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
            return undefined;
        }

        return sanitizeStoredSession(parsed);
    } catch {
        return undefined;
    }
}

export function clearStoredAuthSession(storage: Storage | undefined = getDefaultStorage()): void {
    storage?.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function lockSession(storage: Storage | undefined = getDefaultStorage()): StoredAuthSession | undefined {
    const session = loadStoredAuthSession(storage);
    if (!session) {
        return undefined;
    }

    const locked: StoredAuthSession = {
        ...session,
        locked: true,
    };

    return saveStoredAuthSession(locked, storage);
}

export function unlockSession(
    passphrase: string,
    storage: Storage | undefined = getDefaultStorage()
): UnlockSessionResult {
    const session = loadStoredAuthSession(storage);
    if (!session) {
        throw new Error('No persisted session to unlock');
    }

    if (!session.ncryptsec) {
        throw new Error('Persisted session does not contain ncryptsec payload');
    }

    const privateKeyHex = decryptPrivateKeyFromNcryptsec(session.ncryptsec, passphrase);
    const unlockedSession: StoredAuthSession = {
        ...session,
        locked: false,
    };

    saveStoredAuthSession(unlockedSession, storage);

    return {
        session: unlockedSession,
        privateKeyHex,
    };
}
