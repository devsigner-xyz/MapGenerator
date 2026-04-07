import { beforeEach, describe, expect, test } from 'vitest';
import {
    addRelay,
    getDefaultRelaySettings,
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
            },
            window.localStorage
        );

        expect(saved.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(loadRelaySettings(window.localStorage)).toEqual(saved);
    });

    test('adds and removes relays while keeping normalized values', () => {
        const initial = {
            relays: ['wss://relay.damus.io'],
        };

        const afterAdd = addRelay(initial, 'wss://nos.lol/');
        const duplicateAdd = addRelay(afterAdd, 'wss://nos.lol');
        const afterRemove = removeRelay(duplicateAdd, 'wss://nos.lol/');

        expect(afterAdd.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(duplicateAdd.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(afterRemove.relays).toEqual(['wss://relay.damus.io']);
    });
});
