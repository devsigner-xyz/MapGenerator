import { EASTER_EGG_IDS, type EasterEggId } from '../ts/ui/easter_eggs';

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

interface MarkEasterEggDiscoveredInput {
    easterEggId: EasterEggId;
    currentState: EasterEggProgressState;
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

export function loadEasterEggProgress(storage: StorageLike | null = getDefaultStorage()): EasterEggProgressState {
    if (!storage) {
        return getDefaultState();
    }

    const raw = storage.getItem(EASTER_EGG_PROGRESS_STORAGE_KEY);
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

export function saveEasterEggProgress(
    state: EasterEggProgressState,
    storage: StorageLike | null = getDefaultStorage()
): EasterEggProgressState {
    const normalizedState = normalizeState(state);
    if (storage) {
        storage.setItem(EASTER_EGG_PROGRESS_STORAGE_KEY, JSON.stringify({
            discoveredIds: normalizedState.discoveredIds,
        }));
    }

    return normalizedState;
}

export function markEasterEggDiscovered({
    easterEggId,
    currentState,
    storage = getDefaultStorage(),
}: MarkEasterEggDiscoveredInput): EasterEggProgressState {
    if (currentState.discoveredIds.includes(easterEggId)) {
        return saveEasterEggProgress(currentState, storage);
    }

    return saveEasterEggProgress({
        discoveredIds: [...currentState.discoveredIds, easterEggId],
    }, storage);
}
