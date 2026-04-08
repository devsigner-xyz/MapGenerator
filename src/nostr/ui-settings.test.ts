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
        expect(state.streetLabelsZoomLevel).toBe(10);
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
                streetLabelsZoomLevel: 99,
            },
            window.localStorage
        );

        expect(saved.occupiedLabelsZoomLevel).toBe(20);
        expect(saved.streetLabelsZoomLevel).toBe(20);
        expect(loadUiSettings(window.localStorage).occupiedLabelsZoomLevel).toBe(20);
        expect(loadUiSettings(window.localStorage).streetLabelsZoomLevel).toBe(20);
    });

    test('normalizes street labels enabled flag when saving malformed data', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: 'yes',
            streetLabelsZoomLevel: 10,
        }));

        const loaded = loadUiSettings(window.localStorage);
        expect(loaded.streetLabelsEnabled).toBe(true);
    });
});
