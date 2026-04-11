import { beforeEach, describe, expect, test } from 'vitest';
import {
    addRelay,
    getDefaultRelaySettings,
    getRelaySetByType,
    loadRelaySettings,
    RELAY_SETTINGS_STORAGE_KEY,
    removeRelay,
    saveRelaySettings,
} from './relay-settings';

describe('relay-settings', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('returns bootstrap relays when storage is empty', () => {
        const state = loadRelaySettings(window.localStorage);
        expect(state).toEqual(getDefaultRelaySettings());
        expect(getRelaySetByType(state, 'dmInbox').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'dmOutbox').length).toBeGreaterThan(0);
    });

    test('falls back to bootstrap relays when storage payload is malformed', () => {
        window.localStorage.setItem(RELAY_SETTINGS_STORAGE_KEY, '{invalid-json');
        const state = loadRelaySettings(window.localStorage);

        expect(state).toEqual(getDefaultRelaySettings());
    });

    test('normalizes and deduplicates relays on save', () => {
        const saved = saveRelaySettings(
            {
                relays: [
                    'wss://relay.damus.io/',
                    'wss://relay.damus.io',
                    'wss://nos.lol',
                    'https://invalid.example',
                ],
                byType: {
                    general: ['wss://relay.damus.io', 'wss://nos.lol'],
                    dmInbox: ['wss://relay.damus.io'],
                    dmOutbox: ['wss://nos.lol'],
                },
            },
            window.localStorage
        );

        expect(saved.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(loadRelaySettings(window.localStorage)).toEqual(saved);
    });

    test('adds and removes relays while keeping normalized values', () => {
        const initial = {
            relays: ['wss://relay.damus.io'],
            byType: {
                general: ['wss://relay.damus.io'],
                dmInbox: [] as string[],
                dmOutbox: [] as string[],
            },
        };

        const afterAdd = addRelay(initial, 'wss://nos.lol/', 'dmInbox');
        const duplicateAdd = addRelay(afterAdd, 'wss://nos.lol', 'dmInbox');
        const afterRemove = removeRelay(duplicateAdd, 'wss://nos.lol/', 'dmInbox');

        expect(afterAdd.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(getRelaySetByType(afterAdd, 'dmInbox')).toEqual(['wss://nos.lol']);
        expect(duplicateAdd.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(getRelaySetByType(duplicateAdd, 'dmInbox')).toEqual(['wss://nos.lol']);
        expect(afterRemove.relays).toEqual(['wss://relay.damus.io']);
        expect(getRelaySetByType(afterRemove, 'dmInbox')).toEqual([]);
    });

    test('migrates legacy payload into general relay type', () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({ relays: ['wss://relay.legacy.example'] })
        );

        const state = loadRelaySettings(window.localStorage);
        expect(getRelaySetByType(state, 'general')).toEqual(['wss://relay.legacy.example']);
        expect(getRelaySetByType(state, 'dmInbox').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'dmOutbox').length).toBeGreaterThan(0);
    });
});
