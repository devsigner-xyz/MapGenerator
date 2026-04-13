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
        expect(getRelaySetByType(state, 'nip65Both').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Read').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Write').length).toBeGreaterThan(0);
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
                    nip65Both: ['wss://relay.damus.io'],
                    nip65Read: ['wss://relay.damus.io', 'wss://nos.lol'],
                    nip65Write: ['wss://relay.damus.io'],
                    dmInbox: ['wss://nos.lol'],
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
                nip65Both: ['wss://relay.damus.io'],
                nip65Read: [] as string[],
                nip65Write: [] as string[],
                dmInbox: [] as string[],
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
        expect(getRelaySetByType(state, 'nip65Both')).toEqual(['wss://relay.legacy.example']);
        expect(getRelaySetByType(state, 'dmInbox').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Read').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Write').length).toBeGreaterThan(0);
    });

    test('migrates v1 typed payload into protocol-aligned categories', () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.legacy.example'],
                byType: {
                    general: ['wss://relay.general.example'],
                    dmInbox: ['wss://relay.legacy.read.example'],
                    dmOutbox: ['wss://relay.legacy.write.example'],
                },
            })
        );

        const state = loadRelaySettings(window.localStorage);
        expect(getRelaySetByType(state, 'nip65Both')).toEqual(['wss://relay.general.example']);
        expect(getRelaySetByType(state, 'nip65Read')).toEqual(['wss://relay.legacy.read.example']);
        expect(getRelaySetByType(state, 'nip65Write')).toEqual(['wss://relay.legacy.write.example']);
    });

    test('keeps relay settings isolated per owner pubkey', () => {
        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        const savedA = saveRelaySettings({
            relays: ['wss://relay.owner-a.example'],
            byType: {
                nip65Both: ['wss://relay.owner-a.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
            },
        }, { ownerPubkey: ownerA });

        const loadedA = loadRelaySettings({ ownerPubkey: ownerA });
        const loadedB = loadRelaySettings({ ownerPubkey: ownerB });

        expect(savedA.relays).toEqual(['wss://relay.owner-a.example']);
        expect(loadedA.relays).toEqual(['wss://relay.owner-a.example']);
        expect(loadedB).toEqual(getDefaultRelaySettings());
    });

    test('migrates legacy global relay settings once to first owner', () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({ relays: ['wss://relay.legacy.example'] })
        );

        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        const loadedA = loadRelaySettings({ ownerPubkey: ownerA });
        const loadedB = loadRelaySettings({ ownerPubkey: ownerB });

        expect(loadedA.relays).toContain('wss://relay.legacy.example');
        expect(loadedB.relays).not.toContain('wss://relay.legacy.example');
    });
});
