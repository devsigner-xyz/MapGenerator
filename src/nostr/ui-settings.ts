export const UI_SETTINGS_STORAGE_KEY = 'nostr.overlay.ui.v1';
const DEFAULT_OCCUPIED_LABELS_ZOOM_LEVEL = 8;

interface UiSettingsPayload {
    occupiedLabelsZoomLevel: number;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface UiSettingsState {
    occupiedLabelsZoomLevel: number;
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

function normalizeOccupiedLabelsZoomLevel(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_OCCUPIED_LABELS_ZOOM_LEVEL;
    }

    return Math.max(1, Math.min(20, Math.round(value)));
}

function isUiSettingsPayload(value: unknown): value is UiSettingsPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const payload = value as Partial<UiSettingsPayload>;
    return typeof payload.occupiedLabelsZoomLevel === 'number';
}

export function getDefaultUiSettings(): UiSettingsState {
    return {
        occupiedLabelsZoomLevel: DEFAULT_OCCUPIED_LABELS_ZOOM_LEVEL,
    };
}

export function loadUiSettings(storage: StorageLike | null = getDefaultStorage()): UiSettingsState {
    if (!storage) {
        return getDefaultUiSettings();
    }

    const raw = storage.getItem(UI_SETTINGS_STORAGE_KEY);
    if (!raw) {
        return getDefaultUiSettings();
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isUiSettingsPayload(parsed)) {
            return getDefaultUiSettings();
        }

        return {
            occupiedLabelsZoomLevel: normalizeOccupiedLabelsZoomLevel(parsed.occupiedLabelsZoomLevel),
        };
    } catch {
        return getDefaultUiSettings();
    }
}

export function saveUiSettings(
    state: UiSettingsState,
    storage: StorageLike | null = getDefaultStorage()
): UiSettingsState {
    const nextState: UiSettingsState = {
        occupiedLabelsZoomLevel: normalizeOccupiedLabelsZoomLevel(state.occupiedLabelsZoomLevel),
    };

    if (storage) {
        const payload: UiSettingsPayload = {
            occupiedLabelsZoomLevel: nextState.occupiedLabelsZoomLevel,
        };
        storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}
