import { describe, expect, test } from 'vitest';
import { decodeNpubToHex } from './npub';

describe('decodeNpubToHex', () => {
    test('returns 64-char hex pubkey for valid npub', () => {
        const result = decodeNpubToHex('npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
        expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    test('throws for non-npub values', () => {
        expect(() => decodeNpubToHex('note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq')).toThrow();
    });
});
