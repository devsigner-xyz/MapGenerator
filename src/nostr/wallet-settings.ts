import { normalizeRelayUrl } from './relay-policy';
import { buildStorageScopeKeys } from './storage-scope';
import type { WalletCapabilities, WalletConnection, WalletSettingsState } from './wallet-types';

export const WALLET_SETTINGS_STORAGE_KEY = 'nostr.overlay.wallet.v1';
const WALLET_SESSION_CONNECTION_STORAGE_KEY = 'nostr.overlay.wallet.session.v1';

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

interface WalletSettingsOptions {
    ownerPubkey?: string;
    storage?: StorageLike | null;
    sessionStorage?: StorageLike | null;
}

interface WalletSettingsPayload {
    activeConnection?: WalletConnection | null;
}

interface WalletSessionConnectionPayload {
    uri: string;
    secret: string;
}

function getDefaultStorage(): StorageLike | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function getDefaultSessionStorage(): StorageLike | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function normalizeCapabilities(value: WalletCapabilities | null | undefined): WalletCapabilities {
    return {
        payInvoice: Boolean(value?.payInvoice),
        makeInvoice: Boolean(value?.makeInvoice),
        notifications: Boolean(value?.notifications),
    };
}

function normalizeConnection(
    connection: WalletConnection | null | undefined,
    mode: 'persist' | 'load' = 'persist',
    sessionPayload?: WalletSessionConnectionPayload | null
): WalletConnection | null {
    if (!connection) {
        return null;
    }

    if (connection.method === 'nwc') {
        const relays = [...new Set(connection.relays
            .map((relay) => normalizeRelayUrl(relay))
            .filter((relay): relay is string => relay !== null))];

        if (relays.length === 0) {
            return null;
        }

        return {
            method: 'nwc',
            uri: mode === 'load' ? (sessionPayload?.uri ?? '') : connection.uri.trim(),
            walletServicePubkey: connection.walletServicePubkey.trim().toLowerCase(),
            relays,
            secret: mode === 'load' ? (sessionPayload?.secret ?? '') : connection.secret.trim().toLowerCase(),
            encryption: connection.encryption === 'nip04' ? 'nip04' : 'nip44_v2',
            capabilities: normalizeCapabilities(connection.capabilities),
            restoreState: mode === 'load'
                ? (sessionPayload?.secret ? 'connected' : 'reconnect-required')
                : connection.restoreState,
        };
    }

    return {
        method: 'webln',
        capabilities: normalizeCapabilities(connection.capabilities),
        restoreState: mode === 'load' ? 'reconnect-required' : connection.restoreState,
    };
}

function resolveStorage(options: WalletSettingsOptions): StorageLike | null {
    return options.storage ?? getDefaultStorage();
}

function resolveSessionStorage(options: WalletSettingsOptions): StorageLike | null {
    return options.sessionStorage ?? getDefaultSessionStorage();
}

function buildSessionConnectionKey(ownerPubkey: string | undefined): string {
    if (!ownerPubkey) {
        return WALLET_SESSION_CONNECTION_STORAGE_KEY;
    }

    return buildStorageScopeKeys({ baseKey: WALLET_SESSION_CONNECTION_STORAGE_KEY, ownerPubkey }).scopedKey;
}

function parseSessionConnection(raw: string | null): WalletSessionConnectionPayload | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<WalletSessionConnectionPayload>;
        if (typeof parsed.uri !== 'string' || typeof parsed.secret !== 'string') {
            return null;
        }

        return {
            uri: parsed.uri,
            secret: parsed.secret,
        };
    } catch {
        return null;
    }
}

function parseState(raw: string | null, sessionPayload: WalletSessionConnectionPayload | null = null): WalletSettingsState {
    if (!raw) {
        return getDefaultWalletSettings();
    }

    try {
        const parsed = JSON.parse(raw) as WalletSettingsPayload;
        return {
            activeConnection: normalizeConnection(parsed.activeConnection, 'load', sessionPayload),
        };
    } catch {
        return getDefaultWalletSettings();
    }
}

export function getDefaultWalletSettings(): WalletSettingsState {
    return {
        activeConnection: null,
    };
}

export function loadWalletSettings(options: WalletSettingsOptions = {}): WalletSettingsState {
    const storage = resolveStorage(options);
    const sessionStorage = resolveSessionStorage(options);
    if (!storage) {
        return getDefaultWalletSettings();
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: WALLET_SETTINGS_STORAGE_KEY }
            : { baseKey: WALLET_SETTINGS_STORAGE_KEY, ownerPubkey: options.ownerPubkey }
    );

    if (!keys.normalizedOwnerPubkey) {
        return parseState(storage.getItem(WALLET_SETTINGS_STORAGE_KEY), parseSessionConnection(sessionStorage?.getItem(WALLET_SESSION_CONNECTION_STORAGE_KEY) ?? null));
    }

    const scopedRaw = storage.getItem(keys.scopedKey);
    if (scopedRaw !== null) {
        return parseState(scopedRaw, parseSessionConnection(sessionStorage?.getItem(buildStorageScopeKeys({ baseKey: WALLET_SESSION_CONNECTION_STORAGE_KEY, ownerPubkey: keys.normalizedOwnerPubkey }).scopedKey) ?? null));
    }

    if (storage.getItem(keys.legacyMigrationMarkerKey)) {
        return getDefaultWalletSettings();
    }

    const legacy = parseState(storage.getItem(WALLET_SETTINGS_STORAGE_KEY), parseSessionConnection(sessionStorage?.getItem(WALLET_SESSION_CONNECTION_STORAGE_KEY) ?? null));
    storage.setItem(keys.scopedKey, JSON.stringify(legacy));
    storage.setItem(keys.legacyMigrationMarkerKey, keys.normalizedOwnerPubkey);
    storage.removeItem(WALLET_SETTINGS_STORAGE_KEY);
    sessionStorage?.removeItem(WALLET_SESSION_CONNECTION_STORAGE_KEY);
    return legacy;
}

export function saveWalletSettings(
    state: WalletSettingsState,
    options: WalletSettingsOptions = {}
): WalletSettingsState {
    const nextState: WalletSettingsState = {
        activeConnection: normalizeConnection(state.activeConnection),
    };

    const storage = resolveStorage(options);
    const sessionStorage = resolveSessionStorage(options);
    if (!storage) {
        return nextState;
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: WALLET_SETTINGS_STORAGE_KEY }
            : { baseKey: WALLET_SETTINGS_STORAGE_KEY, ownerPubkey: options.ownerPubkey }
    );
    const payload: WalletSettingsPayload = {
        activeConnection: nextState.activeConnection?.method === 'nwc'
            ? {
                ...nextState.activeConnection,
                uri: '',
                secret: '',
                restoreState: 'reconnect-required',
            }
            : nextState.activeConnection,
    };

    if (nextState.activeConnection?.method === 'nwc') {
        const sessionPayload: WalletSessionConnectionPayload = {
            uri: nextState.activeConnection.uri,
            secret: nextState.activeConnection.secret,
        };
        sessionStorage?.setItem(buildSessionConnectionKey(keys.normalizedOwnerPubkey), JSON.stringify(sessionPayload));
    } else {
        sessionStorage?.removeItem?.(buildSessionConnectionKey(keys.normalizedOwnerPubkey));
    }

    if (keys.normalizedOwnerPubkey) {
        storage.setItem(keys.scopedKey, JSON.stringify(payload));
    } else {
        storage.setItem(WALLET_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}
