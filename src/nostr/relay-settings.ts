import { getBootstrapRelays, mergeRelaySets, normalizeRelayUrl } from './relay-policy';

export const RELAY_SETTINGS_STORAGE_KEY = 'nostr.overlay.relays.v1';

export const RELAY_TYPES = ['general', 'dmInbox', 'dmOutbox'] as const;
export type RelayType = (typeof RELAY_TYPES)[number];

export interface RelaySettingsByType {
    general: string[];
    dmInbox: string[];
    dmOutbox: string[];
}

interface RelaySettingsPayload {
    relays: string[];
    byType?: Partial<Record<RelayType, string[]>>;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface RelaySettingsState {
    relays: string[];
    byType: RelaySettingsByType;
}

const DEFAULT_DM_INBOX_RELAYS = [
    'wss://relay.snort.social',
    'wss://temp.iris.to',
    'wss://vault.iris.to',
];

const DEFAULT_DM_OUTBOX_RELAYS = [
    'wss://relay.snort.social',
    'wss://nostr.wine',
    'wss://at.nostrworks.com',
];

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

function normalizeByType(byType: Partial<Record<RelayType, string[]>>): RelaySettingsByType {
    return {
        general: normalizeRelayList(byType.general ?? []),
        dmInbox: normalizeRelayList(byType.dmInbox ?? []),
        dmOutbox: normalizeRelayList(byType.dmOutbox ?? []),
    };
}

function buildAllRelays(byType: RelaySettingsByType): string[] {
    return mergeRelaySets(byType.general, byType.dmInbox, byType.dmOutbox);
}

function normalizeRelayState(state: RelaySettingsState): RelaySettingsState {
    const byType = normalizeByType(state.byType);
    return {
        byType,
        relays: buildAllRelays(byType),
    };
}

function isRelaySettingsPayload(value: unknown): value is RelaySettingsPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const payload = value as Partial<RelaySettingsPayload>;
    const hasRelays = Array.isArray(payload.relays) && payload.relays.every((relay) => typeof relay === 'string');
    if (!hasRelays) {
        return false;
    }

    if (!payload.byType || typeof payload.byType !== 'object') {
        return true;
    }

    return RELAY_TYPES.every((type) => {
        const set = payload.byType?.[type];
        return set === undefined || (Array.isArray(set) && set.every((relay) => typeof relay === 'string'));
    });
}

export function getDefaultRelaySettings(): RelaySettingsState {
    const bootstrap = getBootstrapRelays();
    const byType = normalizeByType({
        general: bootstrap,
        dmInbox: mergeRelaySets(bootstrap, DEFAULT_DM_INBOX_RELAYS),
        dmOutbox: mergeRelaySets(bootstrap, DEFAULT_DM_OUTBOX_RELAYS),
    });

    return {
        relays: buildAllRelays(byType),
        byType,
    };
}

export function getRelaySetByType(state: RelaySettingsState, relayType: RelayType): string[] {
    return state.byType[relayType] ?? [];
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

        const payload = parsed as RelaySettingsPayload;
        if (payload.byType) {
            return normalizeRelayState({
                relays: normalizeRelayList(payload.relays),
                byType: normalizeByType(payload.byType),
            });
        }

        const defaults = getDefaultRelaySettings().byType;
        const legacyByType = normalizeByType({
            general: payload.relays,
            dmInbox: defaults.dmInbox,
            dmOutbox: defaults.dmOutbox,
        });
        return {
            relays: buildAllRelays(legacyByType),
            byType: legacyByType,
        };
    } catch {
        return getDefaultRelaySettings();
    }
}

export function saveRelaySettings(
    state: RelaySettingsState,
    storage: StorageLike | null = getDefaultStorage()
): RelaySettingsState {
    const nextState = normalizeRelayState(state);

    if (storage) {
        const payload: RelaySettingsPayload = {
            relays: nextState.relays,
            byType: nextState.byType,
        };
        storage.setItem(RELAY_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}

export function addRelay(state: RelaySettingsState, relayUrl: string, relayType: RelayType = 'general'): RelaySettingsState {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) {
        return state;
    }

    const byType = normalizeByType({
        ...state.byType,
        [relayType]: [...state.byType[relayType], normalized],
    });

    return {
        byType,
        relays: buildAllRelays(byType),
    };
}

export function removeRelay(state: RelaySettingsState, relayUrl: string, relayType?: RelayType): RelaySettingsState {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) {
        return state;
    }

    if (relayType) {
        const byType = normalizeByType({
            ...state.byType,
            [relayType]: state.byType[relayType].filter((relay) => relay !== normalized),
        });
        return {
            byType,
            relays: buildAllRelays(byType),
        };
    }

    const byType = normalizeByType({
        general: state.byType.general.filter((relay) => relay !== normalized),
        dmInbox: state.byType.dmInbox.filter((relay) => relay !== normalized),
        dmOutbox: state.byType.dmOutbox.filter((relay) => relay !== normalized),
    });

    return {
        byType,
        relays: buildAllRelays(byType),
    };
}
