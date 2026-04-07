import { describe, expect, test } from 'vitest';
import { decodeNpubToHex, encodeHexToNpub } from './npub';

describe('encodeHexToNpub', () => {
    test('returns npub for valid 64-char hex pubkey', () => {
        const result = encodeHexToNpub('f'.repeat(64));
        expect(result.startsWith('npub1')).toBe(true);
    });

    test('throws for invalid pubkey format', () => {
        expect(() => encodeHexToNpub('not-hex')).toThrow();
    });
});

describe('decodeNpubToHex', () => {
    test('returns 64-char hex pubkey for valid npub', () => {
        const result = decodeNpubToHex('npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
        expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    test('throws for non-npub values', () => {
        expect(() => decodeNpubToHex('note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq')).toThrow();
    });
});
