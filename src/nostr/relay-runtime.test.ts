import { describe, expect, test } from 'vitest';
import { resolveConservativeSocialRelaySets } from './relay-runtime';

describe('resolveConservativeSocialRelaySets', () => {
    test('uses owner-scoped relays as primary and bootstrap as fallback', () => {
        const resolved = resolveConservativeSocialRelaySets({
            ownerPubkey: 'f'.repeat(64),
            loadSettings: () => ({
                relays: ['wss://user-relay.one'],
                byType: {
                    nip65Both: ['wss://user-relay.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            }),
            bootstrapRelays: ['wss://bootstrap.one', 'wss://bootstrap.two'],
        });

        expect(resolved.primary).toEqual(['wss://user-relay.one']);
        expect(resolved.fallback).toEqual(['wss://bootstrap.one', 'wss://bootstrap.two']);
    });

    test('uses bootstrap as primary when owner-scoped relays are empty', () => {
        const resolved = resolveConservativeSocialRelaySets({
            ownerPubkey: 'a'.repeat(64),
            loadSettings: () => ({
                relays: [],
                byType: {
                    nip65Both: [],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                },
            }),
            bootstrapRelays: ['wss://bootstrap.one'],
        });

        expect(resolved.primary).toEqual(['wss://bootstrap.one']);
        expect(resolved.fallback).toEqual([]);
    });
});
