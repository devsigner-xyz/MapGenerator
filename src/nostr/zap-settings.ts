export const ZAP_SETTINGS_STORAGE_KEY = 'nostr.overlay.zaps.v1';
export const DEFAULT_ZAP_AMOUNTS = [21, 128, 256] as const;

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface ZapSettingsPayload {
    amounts?: number[];
}

export interface ZapSettingsState {
    amounts: number[];
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

function normalizeAmount(value: number): number | null {
    if (!Number.isFinite(value)) {
        return null;
    }

    const normalized = Math.round(value);
    if (normalized < 1 || normalized > 1_000_000) {
        return null;
    }

    return normalized;
}

function normalizeAmounts(values: number[]): number[] {
    const next = values
        .map((value) => normalizeAmount(value))
        .filter((value): value is number => value !== null);

    const deduped = [...new Set(next)].sort((a, b) => a - b);
    return deduped.length > 0 ? deduped : [...DEFAULT_ZAP_AMOUNTS];
}

export function getDefaultZapSettings(): ZapSettingsState {
    return {
        amounts: [...DEFAULT_ZAP_AMOUNTS],
    };
}

export function loadZapSettings(storage: StorageLike | null = getDefaultStorage()): ZapSettingsState {
    if (!storage) {
        return getDefaultZapSettings();
    }

    const raw = storage.getItem(ZAP_SETTINGS_STORAGE_KEY);
    if (!raw) {
        return getDefaultZapSettings();
    }

    try {
        const parsed = JSON.parse(raw) as ZapSettingsPayload;
        if (!parsed || !Array.isArray(parsed.amounts)) {
            return getDefaultZapSettings();
        }

        return {
            amounts: normalizeAmounts(parsed.amounts),
        };
    } catch {
        return getDefaultZapSettings();
    }
}

export function saveZapSettings(
    state: ZapSettingsState,
    storage: StorageLike | null = getDefaultStorage()
): ZapSettingsState {
    const nextState: ZapSettingsState = {
        amounts: normalizeAmounts(state.amounts),
    };

    if (storage) {
        const payload: ZapSettingsPayload = {
            amounts: nextState.amounts,
        };
        storage.setItem(ZAP_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}

export function addZapAmount(state: ZapSettingsState, amount: number): ZapSettingsState {
    return {
        amounts: normalizeAmounts([...state.amounts, amount]),
    };
}

export function updateZapAmount(state: ZapSettingsState, index: number, amount: number): ZapSettingsState {
    if (index < 0 || index >= state.amounts.length) {
        return state;
    }

    const next = [...state.amounts];
    const normalized = normalizeAmount(amount);
    if (normalized === null) {
        next.splice(index, 1);
        return {
            amounts: normalizeAmounts(next),
        };
    }

    next[index] = normalized;
    return {
        amounts: normalizeAmounts(next),
    };
}

export function removeZapAmount(state: ZapSettingsState, index: number): ZapSettingsState {
    if (index < 0 || index >= state.amounts.length) {
        return state;
    }

    const next = [...state.amounts];
    next.splice(index, 1);
    return {
        amounts: normalizeAmounts(next),
    };
}
