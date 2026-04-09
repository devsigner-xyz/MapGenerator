import { beforeEach, describe, expect, test } from 'vitest';
import {
    DEFAULT_ZAP_AMOUNTS,
    ZAP_SETTINGS_STORAGE_KEY,
    addZapAmount,
    loadZapSettings,
    removeZapAmount,
    saveZapSettings,
    updateZapAmount,
} from './zap-settings';

describe('zap settings', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('loads default zap amounts when nothing is stored', () => {
        const state = loadZapSettings();
        expect(state.amounts).toEqual(DEFAULT_ZAP_AMOUNTS);
    });

    test('adds and persists a new zap amount sorted and deduped', () => {
        const next = addZapAmount(loadZapSettings(), 64);
        const saved = saveZapSettings(next);

        expect(saved.amounts).toEqual([21, 64, 128, 256]);
        expect(window.localStorage.getItem(ZAP_SETTINGS_STORAGE_KEY) || '').toContain('64');
    });

    test('updates and removes zap amounts safely', () => {
        const updated = updateZapAmount(loadZapSettings(), 1, 333);
        expect(updated.amounts).toEqual([21, 256, 333]);

        const removed = removeZapAmount(updated, 0);
        expect(removed.amounts).toEqual([256, 333]);
    });
});
