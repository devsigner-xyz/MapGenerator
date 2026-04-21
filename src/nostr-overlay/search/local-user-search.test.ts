import { describe, expect, test } from 'vitest';
import { mergeUserSearchResults, searchLocalUsers } from './local-user-search';

describe('local-user-search', () => {
    test('prioritizes followed prefix matches and excludes owner', () => {
        const result = searchLocalUsers({
            query: 'ali',
            ownerPubkey: 'a'.repeat(64),
            followedPubkeys: ['b'.repeat(64)],
            profiles: {
                ['a'.repeat(64)]: { pubkey: 'a'.repeat(64), displayName: 'Alice Owner' },
                ['b'.repeat(64)]: { pubkey: 'b'.repeat(64), displayName: 'Alice Followed' },
                ['c'.repeat(64)]: { pubkey: 'c'.repeat(64), displayName: 'Alice Other' },
                ['d'.repeat(64)]: { pubkey: 'd'.repeat(64), displayName: 'X Alicia' },
            },
        });

        expect(result.pubkeys).toEqual(['b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)]);
    });

    test('matches by nip05 and npub', () => {
        const pubkey = 'e'.repeat(64);
        const byNip05 = searchLocalUsers({
            query: 'alice@example.com',
            followedPubkeys: [],
            profiles: {
                [pubkey]: { pubkey, nip05: 'alice@example.com' },
            },
        });

        const byNpub = searchLocalUsers({
            query: 'npub1',
            followedPubkeys: [],
            profiles: {
                [pubkey]: { pubkey, displayName: 'Alice' },
            },
        });

        expect(byNip05.pubkeys).toEqual([pubkey]);
        expect(byNpub.pubkeys).toEqual([pubkey]);
    });

    test('keeps remote matches that only match on about or lud16', () => {
        const aboutPubkey = '2'.repeat(64);
        const lud16Pubkey = '3'.repeat(64);

        const merged = mergeUserSearchResults({
            query: 'alice',
            followedPubkeys: [],
            local: {
                pubkeys: [],
                profiles: {},
            },
            remote: {
                pubkeys: [aboutPubkey, lud16Pubkey],
                profiles: {
                    [aboutPubkey]: { pubkey: aboutPubkey, about: 'alice in nostr city' },
                    [lud16Pubkey]: { pubkey: lud16Pubkey, lud16: 'alice@getalby.com' },
                },
            },
        });

        expect(merged.pubkeys).toEqual([aboutPubkey, lud16Pubkey]);
    });

    test('keeps local profiles ahead of remote-only profiles when match quality is tied', () => {
        const localPubkey = 'f'.repeat(64);
        const remotePubkey = '1'.repeat(64);

        const merged = mergeUserSearchResults({
            query: 'ali',
            followedPubkeys: [],
            local: {
                pubkeys: [localPubkey],
                profiles: {
                    [localPubkey]: { pubkey: localPubkey, displayName: 'Alice Local' },
                },
            },
            remote: {
                pubkeys: [remotePubkey],
                profiles: {
                    [remotePubkey]: { pubkey: remotePubkey, displayName: 'Alice Remote' },
                },
            },
        });

        expect(merged.pubkeys).toEqual([localPubkey, remotePubkey]);
    });
});
