import { EASTER_EGG_IDS, type EasterEggId } from '../ts/ui/easter_eggs';
import { buildStorageScopeKeys } from './storage-scope';

export const EASTER_EGG_PROGRESS_STORAGE_KEY = 'nostr.overlay.easter-eggs.v1';

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface EasterEggProgressPayload {
    discoveredIds?: unknown;
}

export interface EasterEggProgressState {
    discoveredIds: EasterEggId[];
}

interface EasterEggProgressOptions {
    ownerPubkey?: string;
    storage?: StorageLike | null;
}

interface MarkEasterEggDiscoveredInput {
    easterEggId: EasterEggId;
    currentState: EasterEggProgressState;
    ownerPubkey?: string;
    storage?: StorageLike | null;
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

function normalizeDiscoveredIds(input: unknown): EasterEggId[] {
    if (!Array.isArray(input)) {
        return [];
    }

    const allowed = new Set(EASTER_EGG_IDS);
    const normalized: EasterEggId[] = [];
    for (const value of input) {
        if (typeof value !== 'string') {
            continue;
        }

        const candidate = value as EasterEggId;
        if (!allowed.has(candidate)) {
            continue;
        }

        if (!normalized.includes(candidate)) {
            normalized.push(candidate);
        }
    }

    return normalized;
}

function getDefaultState(): EasterEggProgressState {
    return {
        discoveredIds: [],
    };
}

function normalizeState(input: EasterEggProgressState): EasterEggProgressState {
    return {
        discoveredIds: normalizeDiscoveredIds(input.discoveredIds),
    };
}

function parseState(raw: string | null): EasterEggProgressState {
    if (!raw) {
        return getDefaultState();
    }

    try {
        const payload = JSON.parse(raw) as EasterEggProgressPayload;
        return {
            discoveredIds: normalizeDiscoveredIds(payload.discoveredIds),
        };
    } catch {
        return getDefaultState();
    }
}

function resolveStorage(options: EasterEggProgressOptions): StorageLike | null {
    return options.storage ?? getDefaultStorage();
}

export function loadEasterEggProgress(options: EasterEggProgressOptions = {}): EasterEggProgressState {
    const storage = resolveStorage(options);
    if (!storage) {
        return getDefaultState();
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: EASTER_EGG_PROGRESS_STORAGE_KEY }
            : {
                baseKey: EASTER_EGG_PROGRESS_STORAGE_KEY,
                ownerPubkey: options.ownerPubkey,
            }
    );

    if (!keys.normalizedOwnerPubkey) {
        return getDefaultState();
    }

    const scopedRaw = storage.getItem(keys.scopedKey);
    if (scopedRaw !== null) {
        return parseState(scopedRaw);
    }

    const migrationOwner = storage.getItem(keys.legacyMigrationMarkerKey);
    if (migrationOwner) {
        return getDefaultState();
    }

    const legacy = parseState(storage.getItem(EASTER_EGG_PROGRESS_STORAGE_KEY));
    if (legacy.discoveredIds.length === 0) {
        return getDefaultState();
    }

    storage.setItem(keys.scopedKey, JSON.stringify(legacy));
    storage.setItem(keys.legacyMigrationMarkerKey, keys.normalizedOwnerPubkey);
    return legacy;
}

export function saveEasterEggProgress(
    state: EasterEggProgressState,
    options: EasterEggProgressOptions = {}
): EasterEggProgressState {
    const normalizedState = normalizeState(state);
    const storage = resolveStorage(options);
    if (!storage) {
        return normalizedState;
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: EASTER_EGG_PROGRESS_STORAGE_KEY }
            : {
                baseKey: EASTER_EGG_PROGRESS_STORAGE_KEY,
                ownerPubkey: options.ownerPubkey,
            }
    );

    if (!keys.normalizedOwnerPubkey) {
        return normalizedState;
    }

    storage.setItem(keys.scopedKey, JSON.stringify({
        discoveredIds: normalizedState.discoveredIds,
    }));

    return normalizedState;
}

export function markEasterEggDiscovered({
    easterEggId,
    currentState,
    ownerPubkey,
    storage = getDefaultStorage(),
}: MarkEasterEggDiscoveredInput): EasterEggProgressState {
    const saveOptions: EasterEggProgressOptions = {
        storage,
    };
    if (ownerPubkey !== undefined) {
        saveOptions.ownerPubkey = ownerPubkey;
    }

    if (currentState.discoveredIds.includes(easterEggId)) {
        return saveEasterEggProgress(currentState, saveOptions);
    }

    return saveEasterEggProgress({
        discoveredIds: [...currentState.discoveredIds, easterEggId],
    }, saveOptions);
}
