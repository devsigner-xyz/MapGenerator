import { describe, expect, test } from 'vitest';
import { decodeNpubToHex, decodeNsecToHex, encodeHexToNpub } from './npub';

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

    test('throws for malformed npub identifiers', () => {
        expect(() => decodeNpubToHex('npub1invalid')).toThrow();
    });
});

describe('decodeNsecToHex', () => {
    test('returns 64-char hex private key for valid nsec', () => {
        const result = decodeNsecToHex('nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5');
        expect(result).toBe('67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa');
    });

    test('throws for non-nsec values', () => {
        expect(() => decodeNsecToHex('npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw')).toThrow();
    });

    test('throws for malformed nsec values', () => {
        expect(() => decodeNsecToHex('nsec1invalid')).toThrow();
    });
});
