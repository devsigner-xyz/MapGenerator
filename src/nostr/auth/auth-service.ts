import { Nip07AuthProvider } from './providers/nip07-provider';
import { Nip46AuthProvider } from './providers/nip46-provider';
import { NpubAuthProvider } from './providers/npub-provider';
import type { AuthProvider, ProviderResolveInput } from './providers/types';
import {
    clearStoredAuthSession,
    loadStoredAuthSession,
    saveStoredAuthSession,
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
    logout(): Promise<void>;
}

function buildDefaultProviders(): Record<LoginMethod, AuthProvider> {
    return {
        npub: new NpubAuthProvider(),
        nip07: new Nip07AuthProvider(),
        nip46: new Nip46AuthProvider(),
    };
}

function toStoredSession(session: AuthSessionState): StoredAuthSession {
    return {
        method: session.method,
        pubkey: session.pubkey,
        readonly: session.readonly,
        locked: session.locked,
        createdAt: session.createdAt,
    };
}

function isLegacyNsecMethod(method: string): method is 'nsec' {
    return method === 'nsec';
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
        void input;
        saveStoredAuthSession(toStoredSession(session), storage);
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
            if (isLegacyNsecMethod(method)) {
                throw new Error('nsec login is no longer supported');
            }

            const provider = providerMap[method];
            if (!provider) {
                throw new Error(`Unsupported login method: ${method}`);
            }

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
            void input;
            const stored = loadStoredAuthSession(storage);
            if (!stored) {
                currentSession = undefined;
                activeProvider = undefined;
                return undefined;
            }

            const storedMethod = stored.method;

            if (isLegacyNsecMethod(storedMethod)) {
                clearStoredAuthSession(storage);
                currentSession = undefined;
                activeProvider = undefined;
                notify();
                return undefined;
            }

            if (storedMethod === 'nip07') {
                try {
                    return await this.startSession('nip07', {});
                } catch {
                    clearStoredAuthSession(storage);
                    currentSession = undefined;
                    activeProvider = undefined;
                    notify();
                    return undefined;
                }
            }

            if (storedMethod === 'nip46') {
                clearStoredAuthSession(storage);
                currentSession = undefined;
                activeProvider = undefined;
                notify();
                return undefined;
            }

            const requiresRecoveredProvider = storedMethod !== 'npub';
            const restoredLocked = stored.locked || requiresRecoveredProvider;

            currentSession = {
                ...createAuthSession({
                    method: storedMethod,
                    pubkey: stored.pubkey,
                    locked: restoredLocked,
                    createdAt: stored.createdAt,
                    capabilities: defaultCapabilitiesForMethod(storedMethod),
                }),
                readonly: stored.readonly,
                locked: restoredLocked,
            };
            activeProvider = undefined;
            notify();

            return currentSession;
        },

        async switchMethod(method: LoginMethod, input: ProviderResolveInput): Promise<AuthSessionState> {
            if (isLegacyNsecMethod(method)) {
                throw new Error('nsec login is no longer supported');
            }

            if (activeProvider) {
                await activeProvider.lock();
            }

            return this.startSession(method, input);
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
