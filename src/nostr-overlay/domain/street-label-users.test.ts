import { describe, expect, test } from 'vitest';
import { extractStreetLabelUsernames } from './street-label-users';

describe('extractStreetLabelUsernames', () => {
    test('extracts unique usernames from occupied profiles preserving first appearance', () => {
        const usernames = extractStreetLabelUsernames({
            occupancyByBuildingIndex: {
                4: 'pubkey-a',
                2: 'pubkey-b',
                8: 'pubkey-c',
            },
            profiles: {
                'pubkey-a': { pubkey: 'pubkey-a', displayName: 'Alice' },
                'pubkey-b': { pubkey: 'pubkey-b', name: 'Bob' },
                'pubkey-c': { pubkey: 'pubkey-c', displayName: 'alice' },
            },
        });

        expect(usernames).toEqual(['Bob', 'Alice']);
    });

    test('ignores blank and missing names', () => {
        const usernames = extractStreetLabelUsernames({
            occupancyByBuildingIndex: {
                1: 'pubkey-a',
                3: 'pubkey-b',
            },
            profiles: {
                'pubkey-a': { pubkey: 'pubkey-a', displayName: '   ' },
                'pubkey-b': { pubkey: 'pubkey-b' },
            },
        });

        expect(usernames).toEqual([]);
    });
});
