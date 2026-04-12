import { beforeEach, describe, expect, test } from 'vitest';
import {
    UI_SETTINGS_STORAGE_KEY,
    getDefaultUiSettings,
    loadUiSettings,
    saveUiSettings,
} from './ui-settings';

describe('ui-settings', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('returns default settings when storage is empty', () => {
        const state = loadUiSettings(window.localStorage);
        expect(state).toEqual(getDefaultUiSettings());
        expect(state.occupiedLabelsZoomLevel).toBe(8);
        expect(state.streetLabelsEnabled).toBe(true);
        expect(state.specialMarkersEnabled).toBe(true);
        expect(state.verifiedBuildingsOverlayEnabled).toBe(false);
        expect(state.streetLabelsZoomLevel).toBe(10);
        expect(state.trafficParticlesCount).toBe(12);
        expect(state.trafficParticlesSpeed).toBe(1);
    });

    test('falls back to defaults when payload is malformed', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, '{bad-json');
        expect(loadUiSettings(window.localStorage)).toEqual(getDefaultUiSettings());
    });

    test('normalizes zoom threshold when saving', () => {
        const saved = saveUiSettings(
            {
                occupiedLabelsZoomLevel: 99,
                streetLabelsEnabled: true,
                specialMarkersEnabled: false,
                verifiedBuildingsOverlayEnabled: true,
                streetLabelsZoomLevel: 99,
                trafficParticlesCount: 99,
                trafficParticlesSpeed: 99,
            },
            window.localStorage
        );

        expect(saved.occupiedLabelsZoomLevel).toBe(20);
        expect(saved.streetLabelsZoomLevel).toBe(20);
        expect(saved.specialMarkersEnabled).toBe(false);
        expect(saved.trafficParticlesCount).toBe(50);
        expect(saved.trafficParticlesSpeed).toBe(3);
        expect(loadUiSettings(window.localStorage).occupiedLabelsZoomLevel).toBe(20);
        expect(loadUiSettings(window.localStorage).streetLabelsZoomLevel).toBe(20);
        expect(loadUiSettings(window.localStorage).trafficParticlesCount).toBe(50);
        expect(loadUiSettings(window.localStorage).trafficParticlesSpeed).toBe(3);
    });

    test('normalizes traffic particle settings when saving out-of-range values', () => {
        const saved = saveUiSettings(
            {
                occupiedLabelsZoomLevel: 8,
                streetLabelsEnabled: true,
                specialMarkersEnabled: true,
                verifiedBuildingsOverlayEnabled: false,
                streetLabelsZoomLevel: 10,
                trafficParticlesCount: -5,
                trafficParticlesSpeed: -10,
            },
            window.localStorage
        );

        expect(saved.trafficParticlesCount).toBe(0);
        expect(saved.trafficParticlesSpeed).toBe(0.2);

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.trafficParticlesCount).toBe(0);
        expect(loaded.trafficParticlesSpeed).toBe(0.2);
    });

    test('normalizes street labels enabled flag when saving malformed data', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: 'yes',
            specialMarkersEnabled: true,
            streetLabelsZoomLevel: 10,
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.streetLabelsEnabled).toBe(true);
    });

    test('normalizes verified buildings overlay flag when payload is malformed', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            specialMarkersEnabled: true,
            verifiedBuildingsOverlayEnabled: 'true',
            streetLabelsZoomLevel: 10,
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.verifiedBuildingsOverlayEnabled).toBe(false);
    });

    test('normalizes special markers flag when payload is malformed', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            specialMarkersEnabled: 'enabled',
            verifiedBuildingsOverlayEnabled: false,
            streetLabelsZoomLevel: 10,
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.specialMarkersEnabled).toBe(true);
    });
});
