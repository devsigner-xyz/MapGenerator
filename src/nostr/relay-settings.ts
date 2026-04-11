import { getBootstrapRelays, mergeRelaySets, normalizeRelayUrl } from './relay-policy';

export const RELAY_SETTINGS_STORAGE_KEY = 'nostr.overlay.relays.v1';

export const RELAY_TYPES = ['nip65Both', 'nip65Read', 'nip65Write', 'dmInbox'] as const;
export type RelayType = (typeof RELAY_TYPES)[number];

export interface RelaySettingsByType {
    nip65Both: string[];
    nip65Read: string[];
    nip65Write: string[];
    dmInbox: string[];
}

interface LegacyRelaySettingsByType {
    general?: string[];
    dmInbox?: string[];
    dmOutbox?: string[];
}

interface RelaySettingsPayload {
    relays: string[];
    byType?: Partial<Record<RelayType, string[]>> | LegacyRelaySettingsByType;
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

function normalizeByType(byType: Partial<Record<RelayType, string[]>> | LegacyRelaySettingsByType): RelaySettingsByType {
    const typed = byType as Partial<Record<RelayType, string[]>>;
    const legacy = byType as LegacyRelaySettingsByType;

    return {
        nip65Both: normalizeRelayList(typed.nip65Both ?? legacy.general ?? []),
        nip65Read: normalizeRelayList(typed.nip65Read ?? legacy.dmInbox ?? []),
        nip65Write: normalizeRelayList(typed.nip65Write ?? legacy.dmOutbox ?? []),
        dmInbox: normalizeRelayList(typed.dmInbox ?? legacy.dmInbox ?? []),
    };
}

function buildAllRelays(byType: RelaySettingsByType): string[] {
    return mergeRelaySets(byType.nip65Both, byType.nip65Read, byType.nip65Write, byType.dmInbox);
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

    if (!payload.byType || typeof payload.byType !== 'object' || Array.isArray(payload.byType)) {
        return true;
    }

    const byType = payload.byType as Record<string, unknown>;
    return Object.values(byType).every(
        (set) => set === undefined || (Array.isArray(set) && set.every((relay) => typeof relay === 'string'))
    );
}

export function getDefaultRelaySettings(): RelaySettingsState {
    const bootstrap = getBootstrapRelays();
    const byType = normalizeByType({
        nip65Both: bootstrap,
        nip65Read: bootstrap,
        nip65Write: bootstrap,
        dmInbox: DEFAULT_DM_INBOX_RELAYS,
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
            nip65Both: payload.relays,
            nip65Read: defaults.nip65Read,
            nip65Write: defaults.nip65Write,
            dmInbox: defaults.dmInbox,
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

export function addRelay(state: RelaySettingsState, relayUrl: string, relayType: RelayType = 'nip65Both'): RelaySettingsState {
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
        nip65Both: state.byType.nip65Both.filter((relay) => relay !== normalized),
        nip65Read: state.byType.nip65Read.filter((relay) => relay !== normalized),
        nip65Write: state.byType.nip65Write.filter((relay) => relay !== normalized),
        dmInbox: state.byType.dmInbox.filter((relay) => relay !== normalized),
    });

    return {
        byType,
        relays: buildAllRelays(byType),
    };
}
