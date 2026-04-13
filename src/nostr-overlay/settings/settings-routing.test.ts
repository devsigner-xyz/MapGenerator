import { describe, expect, test } from 'vitest';
import {
    buildSettingsPath,
    isSettingsRouteView,
    SETTINGS_ROUTE_VIEWS,
    settingsViewFromPathname,
} from './settings-routing';

describe('settings-routing', () => {
    test('recognizes supported settings route views', () => {
        for (const view of SETTINGS_ROUTE_VIEWS) {
            expect(isSettingsRouteView(view)).toBe(true);
        }

        expect(isSettingsRouteView('relay-detail')).toBe(false);
        expect(isSettingsRouteView('foo')).toBe(false);
    });

    test('extracts first settings segment from pathname', () => {
        expect(settingsViewFromPathname('/settings/ui')).toBe('ui');
        expect(settingsViewFromPathname('/settings/relays')).toBe('relays');
        expect(settingsViewFromPathname('/settings/relays/detail')).toBe('relays');
        expect(settingsViewFromPathname('/settings/zaps/anything')).toBe('zaps');
    });

    test('returns null when pathname is not a supported settings route', () => {
        expect(settingsViewFromPathname('/')).toBeNull();
        expect(settingsViewFromPathname('/settings')).toBeNull();
        expect(settingsViewFromPathname('/settings/relay-detail')).toBeNull();
        expect(settingsViewFromPathname('/settings/unknown')).toBeNull();
    });

    test('builds canonical settings paths', () => {
        expect(buildSettingsPath('ui')).toBe('/settings/ui');
        expect(buildSettingsPath('advanced')).toBe('/settings/advanced');
        expect(buildSettingsPath('relays')).toBe('/settings/relays');
    });
});
