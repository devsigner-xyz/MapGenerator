import { NsecAuthProvider } from './providers/nsec-provider';
import { Nip07AuthProvider } from './providers/nip07-provider';
import { Nip46AuthProvider } from './providers/nip46-provider';
import { NpubAuthProvider } from './providers/npub-provider';
import type { AuthProvider, ProviderResolveInput } from './providers/types';
import {
    clearStoredAuthSession,
    encryptPrivateKeyToNcryptsec,
    lockSession as lockStoredSession,
    loadStoredAuthSession,
    saveStoredAuthSession,
    unlockSession as unlockStoredSession,
    type StoredAuthSession,
} from './secure-storage';
import {
    createAuthSession,
    defaultCapabilitiesForMethod,
    type AuthSessionState,
    type LoginMethod,
} from './session';

interface AuthServiceOptions {
    storage?: Storage;
    now?: () => number;
    providers?: Partial<Record<LoginMethod, AuthProvider>>;
}

type SessionListener = (session: AuthSessionState | undefined) => void;

interface RestoreSessionInput {
    passphrase?: string;
}

interface AuthService {
    getSession(): AuthSessionState | undefined;
    getActiveProvider(): AuthProvider | undefined;
    subscribe(listener: SessionListener): () => void;
    startSession(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState>;
    restoreSession(input?: RestoreSessionInput): Promise<AuthSessionState | undefined>;
    switchMethod(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState>;
    lockSession(): Promise<AuthSessionState | undefined>;
    unlockSession(passphrase: string): Promise<AuthSessionState>;
    logout(): Promise<void>;
}

function buildDefaultProviders(): Record<LoginMethod, AuthProvider> {
    return {
        npub: new NpubAuthProvider(),
        nsec: new NsecAuthProvider(),
        nip07: new Nip07AuthProvider(),
        nip46: new Nip46AuthProvider(),
    };
}

function toStoredSession(session: AuthSessionState, ncryptsec?: string): StoredAuthSession {
    return {
        method: session.method,
        pubkey: session.pubkey,
        readonly: session.readonly,
        locked: session.locked,
        createdAt: session.createdAt,
        ncryptsec,
    };
}

export function createAuthService(options: AuthServiceOptions = {}): AuthService {
    const storage = options.storage;
    const now = options.now ?? (() => Date.now());
    const providerMap: Record<LoginMethod, AuthProvider> = {
        ...buildDefaultProviders(),
        ...(options.providers ?? {}),
    };
    const listeners = new Set<SessionListener>();

    let currentSession: AuthSessionState | undefined;
    let activeProvider: AuthProvider | undefined;

    const notify = () => {
        listeners.forEach((listener) => listener(currentSession));
    };

    const persist = (session: AuthSessionState, input: ProviderResolveInput) => {
        let ncryptsec: string | undefined;

        if (session.method === 'nsec') {
            if (input.ncryptsec) {
                ncryptsec = input.ncryptsec;
            } else if (input.credential && input.passphrase) {
                ncryptsec = encryptPrivateKeyToNcryptsec(input.credential, input.passphrase);
            }
        }

        saveStoredAuthSession(toStoredSession(session, ncryptsec), storage);
    };

    return {
        getSession(): AuthSessionState | undefined {
            return currentSession;
        },

        getActiveProvider(): AuthProvider | undefined {
            return activeProvider;
        },

        subscribe(listener: SessionListener): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        async startSession(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState> {
            const provider = providerMap[method];
            const resolved = await provider.resolveSession(input);

            const baseSession = createAuthSession({
                method: resolved.method,
                pubkey: resolved.pubkey,
                locked: resolved.locked,
                createdAt: now(),
                capabilities: resolved.capabilities,
            });

            currentSession = {
                ...baseSession,
                readonly: resolved.readonly,
                locked: resolved.locked,
                capabilities: resolved.capabilities,
            };
            activeProvider = provider;

            persist(currentSession, input);
            notify();

            return currentSession;
        },

        async restoreSession(input: RestoreSessionInput = {}): Promise<AuthSessionState | undefined> {
            const stored = loadStoredAuthSession(storage);
            if (!stored) {
                currentSession = undefined;
                activeProvider = undefined;
                return undefined;
            }

            if (stored.method === 'nsec' && !stored.locked && stored.ncryptsec && input.passphrase) {
                return this.startSession('nsec', {
                    ncryptsec: stored.ncryptsec,
                    passphrase: input.passphrase,
                });
            }

            currentSession = {
                ...createAuthSession({
                    method: stored.method,
                    pubkey: stored.pubkey,
                    locked: stored.locked,
                    createdAt: stored.createdAt,
                    capabilities: defaultCapabilitiesForMethod(stored.method),
                }),
                readonly: stored.readonly,
                locked: stored.locked,
            };
            activeProvider = undefined;
            notify();

            return currentSession;
        },

        async switchMethod(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState> {
            if (activeProvider) {
                await activeProvider.lock();
            }

            return this.startSession(method, input);
        },

        async lockSession(): Promise<AuthSessionState | undefined> {
            if (!currentSession) {
                return undefined;
            }

            if (activeProvider) {
                await activeProvider.lock();
            }

            if (currentSession.method === 'nsec') {
                lockStoredSession(storage);
            }

            currentSession = {
                ...currentSession,
                locked: true,
            };
            activeProvider = undefined;
            notify();

            return currentSession;
        },

        async unlockSession(passphrase: string): Promise<AuthSessionState> {
            if (!currentSession || currentSession.method !== 'nsec') {
                throw new Error('Only nsec sessions can be unlocked');
            }

            const unlocked = unlockStoredSession(passphrase, storage);

            return this.startSession('nsec', {
                ncryptsec: unlocked.session.ncryptsec,
                passphrase,
            });
        },

        async logout(): Promise<void> {
            if (activeProvider) {
                await activeProvider.lock();
            }

            clearStoredAuthSession(storage);
            currentSession = undefined;
            activeProvider = undefined;
            notify();
        },
    };
}
