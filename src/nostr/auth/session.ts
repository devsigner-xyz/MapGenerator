export type LoginMethod = 'npub' | 'nip07' | 'nip46';

export type EncryptionScheme = 'nip04' | 'nip44';

export interface SessionCapabilities {
    canSign: boolean;
    canEncrypt: boolean;
    encryptionSchemes: EncryptionScheme[];
}

export interface AuthSessionState {
    method: LoginMethod;
    pubkey: string;
    readonly: boolean;
    locked: boolean;
    capabilities: SessionCapabilities;
    createdAt: number;
}

interface CreateAuthSessionInput {
    method: LoginMethod;
    pubkey: string;
    locked?: boolean;
    createdAt?: number;
    capabilities?: SessionCapabilities;
}

export function defaultCapabilitiesForMethod(method: LoginMethod): SessionCapabilities {
    if (method === 'npub') {
        return {
            canSign: false,
            canEncrypt: false,
            encryptionSchemes: [],
        };
    }

    return {
        canSign: true,
        canEncrypt: false,
        encryptionSchemes: [],
    };
}

export function createAuthSession(input: CreateAuthSessionInput): AuthSessionState {
    const capabilities = input.capabilities ?? defaultCapabilitiesForMethod(input.method);
    const readonly = !capabilities.canSign || input.method === 'npub';

    return {
        method: input.method,
        pubkey: input.pubkey,
        readonly,
        locked: Boolean(input.locked),
        capabilities,
        createdAt: input.createdAt ?? Date.now(),
    };
}

export function isSessionReady(session: AuthSessionState | undefined): boolean {
    return Boolean(session && session.pubkey.length > 0);
}

export function isWriteEnabled(session: AuthSessionState | undefined): boolean {
    if (!session) {
        return false;
    }

    if (session.readonly || session.locked) {
        return false;
    }

    return session.capabilities.canSign;
}

export function isEncryptionEnabled(
    session: AuthSessionState | undefined,
    scheme?: EncryptionScheme | string
): boolean {
    if (!session) {
        return false;
    }

    if (!isWriteEnabled(session) || !session.capabilities.canEncrypt) {
        return false;
    }

    if (!scheme) {
        return session.capabilities.encryptionSchemes.length > 0;
    }

    return hasEncryptionScheme(session, scheme);
}

export function hasEncryptionScheme(session: AuthSessionState, scheme: EncryptionScheme | string): boolean {
    return session.capabilities.encryptionSchemes.includes(scheme as EncryptionScheme);
}

export function isDirectMessagesEnabled(session: AuthSessionState | undefined): boolean {
    if (!session) {
        return false;
    }

    return isWriteEnabled(session) && hasEncryptionScheme(session, 'nip44');
}
