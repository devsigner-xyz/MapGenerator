export const UI_SETTINGS_STORAGE_KEY = 'nostr.overlay.ui.v1';
const DEFAULT_OCCUPIED_LABELS_ZOOM_LEVEL = 8;
const DEFAULT_STREET_LABELS_ENABLED = true;
const DEFAULT_STREET_LABELS_ZOOM_LEVEL = 10;
const DEFAULT_TRAFFIC_PARTICLES_COUNT = 12;
const DEFAULT_TRAFFIC_PARTICLES_SPEED = 1;

interface UiSettingsPayload {
    occupiedLabelsZoomLevel?: number;
    streetLabelsEnabled?: boolean;
    streetLabelsZoomLevel?: number;
    trafficParticlesCount?: number;
    trafficParticlesSpeed?: number;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface UiSettingsState {
    occupiedLabelsZoomLevel: number;
    streetLabelsEnabled: boolean;
    streetLabelsZoomLevel: number;
    trafficParticlesCount: number;
    trafficParticlesSpeed: number;
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

function normalizeStreetLabelsZoomLevel(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_STREET_LABELS_ZOOM_LEVEL;
    }

    return Math.max(1, Math.min(20, Math.round(value)));
}

function normalizeStreetLabelsEnabled(value: boolean): boolean {
    return typeof value === 'boolean' ? value : DEFAULT_STREET_LABELS_ENABLED;
}

function normalizeTrafficParticlesCount(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_TRAFFIC_PARTICLES_COUNT;
    }

    return Math.max(0, Math.min(50, Math.round(value)));
}

function normalizeTrafficParticlesSpeed(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_TRAFFIC_PARTICLES_SPEED;
    }

    const clamped = Math.max(0.2, Math.min(3, value));
    return Math.round(clamped * 10) / 10;
}

function isUiSettingsPayload(value: unknown): value is UiSettingsPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    return true;
}

export function getDefaultUiSettings(): UiSettingsState {
    return {
        occupiedLabelsZoomLevel: DEFAULT_OCCUPIED_LABELS_ZOOM_LEVEL,
        streetLabelsEnabled: DEFAULT_STREET_LABELS_ENABLED,
        streetLabelsZoomLevel: DEFAULT_STREET_LABELS_ZOOM_LEVEL,
        trafficParticlesCount: DEFAULT_TRAFFIC_PARTICLES_COUNT,
        trafficParticlesSpeed: DEFAULT_TRAFFIC_PARTICLES_SPEED,
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
            streetLabelsEnabled: normalizeStreetLabelsEnabled(parsed.streetLabelsEnabled),
            streetLabelsZoomLevel: normalizeStreetLabelsZoomLevel(parsed.streetLabelsZoomLevel),
            trafficParticlesCount: normalizeTrafficParticlesCount(parsed.trafficParticlesCount),
            trafficParticlesSpeed: normalizeTrafficParticlesSpeed(parsed.trafficParticlesSpeed),
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
        streetLabelsEnabled: normalizeStreetLabelsEnabled(state.streetLabelsEnabled),
        streetLabelsZoomLevel: normalizeStreetLabelsZoomLevel(state.streetLabelsZoomLevel),
        trafficParticlesCount: normalizeTrafficParticlesCount(state.trafficParticlesCount),
        trafficParticlesSpeed: normalizeTrafficParticlesSpeed(state.trafficParticlesSpeed),
    };

    if (storage) {
        const payload: UiSettingsPayload = {
            occupiedLabelsZoomLevel: nextState.occupiedLabelsZoomLevel,
            streetLabelsEnabled: nextState.streetLabelsEnabled,
            streetLabelsZoomLevel: nextState.streetLabelsZoomLevel,
            trafficParticlesCount: nextState.trafficParticlesCount,
            trafficParticlesSpeed: nextState.trafficParticlesSpeed,
        };
        storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}
