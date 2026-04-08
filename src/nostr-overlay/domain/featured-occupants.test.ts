import { describe, expect, test } from 'vitest';
import { encodeHexToNpub } from '../../nostr/npub';
import { extractFeaturedOccupantPubkeys } from './featured-occupants';

describe('extractFeaturedOccupantPubkeys', () => {
    test('decodes valid npubs preserving first appearance', () => {
        const firstPubkey = '1'.repeat(64);
        const secondPubkey = '2'.repeat(64);
        const firstNpub = encodeHexToNpub(firstPubkey);
        const secondNpub = encodeHexToNpub(secondPubkey);

        const result = extractFeaturedOccupantPubkeys({
            accounts: [
                { npub: firstNpub },
                { npub: secondNpub },
                { npub: firstNpub },
            ],
        });

        expect(result).toEqual([firstPubkey, secondPubkey]);
    });

    test('ignores invalid and empty entries', () => {
        const pubkey = '3'.repeat(64);
        const npub = encodeHexToNpub(pubkey);

        const result = extractFeaturedOccupantPubkeys({
            accounts: [
                {},
                { npub: '' },
                { npub: 'not-an-npub' },
                { npub: npub },
            ],
        });

        expect(result).toEqual([pubkey]);
    });
});
