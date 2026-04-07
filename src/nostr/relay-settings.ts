import { getBootstrapRelays, mergeRelaySets, normalizeRelayUrl } from './relay-policy';

export const RELAY_SETTINGS_STORAGE_KEY = 'nostr.overlay.relays.v1';

interface RelaySettingsPayload {
    relays: string[];
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface RelaySettingsState {
    relays: string[];
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

function normalizeRelayList(relays: string[]): string[] {
    return mergeRelaySets(relays);
}

function isRelaySettingsPayload(value: unknown): value is RelaySettingsPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const payload = value as Partial<RelaySettingsPayload>;
    return Array.isArray(payload.relays) && payload.relays.every((relay) => typeof relay === 'string');
}

export function getDefaultRelaySettings(): RelaySettingsState {
    return {
        relays: getBootstrapRelays(),
    };
}

export function loadRelaySettings(storage: StorageLike | null = getDefaultStorage()): RelaySettingsState {
    if (!storage) {
        return getDefaultRelaySettings();
    }

    const raw = storage.getItem(RELAY_SETTINGS_STORAGE_KEY);
    if (!raw) {
        return getDefaultRelaySettings();
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isRelaySettingsPayload(parsed)) {
            return getDefaultRelaySettings();
        }

        return {
            relays: normalizeRelayList(parsed.relays),
        };
    } catch {
        return getDefaultRelaySettings();
    }
}

export function saveRelaySettings(
    state: RelaySettingsState,
    storage: StorageLike | null = getDefaultStorage()
): RelaySettingsState {
    const nextState: RelaySettingsState = {
        relays: normalizeRelayList(state.relays),
    };

    if (storage) {
        const payload: RelaySettingsPayload = {
            relays: nextState.relays,
        };
        storage.setItem(RELAY_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}

export function addRelay(state: RelaySettingsState, relayUrl: string): RelaySettingsState {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) {
        return state;
    }

    return {
        relays: normalizeRelayList([...state.relays, normalized]),
    };
}

export function removeRelay(state: RelaySettingsState, relayUrl: string): RelaySettingsState {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) {
        return state;
    }

    return {
        relays: state.relays.filter((relay) => relay !== normalized),
    };
}
