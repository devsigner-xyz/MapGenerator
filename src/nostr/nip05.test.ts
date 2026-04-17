import { describe, expect, test } from 'vitest';
import {
    getNip05DisplayIdentifier,
    parseNip05Identifier,
} from './nip05';

describe('parseNip05Identifier', () => {
    test('parses standard name@domain values', () => {
        expect(parseNip05Identifier('alice@example.com')).toEqual({
            domain: 'example.com',
            name: 'alice',
            normalized: 'alice@example.com',
            display: 'alice@example.com',
        });
    });

    test('parses _@domain and uses domain as display label', () => {
        expect(parseNip05Identifier('_@example.com')).toEqual({
            domain: 'example.com',
            name: '_',
            normalized: '_@example.com',
            display: 'example.com',
        });
    });

    test('returns null for malformed values', () => {
        expect(parseNip05Identifier('')).toBeNull();
        expect(parseNip05Identifier('example.com')).toBeNull();
        expect(parseNip05Identifier('@example.com')).toBeNull();
        expect(parseNip05Identifier('alice@')).toBeNull();
    });
});

describe('getNip05DisplayIdentifier', () => {
    test('returns display label for valid identifiers', () => {
        expect(getNip05DisplayIdentifier('_@example.com')).toBe('example.com');
        expect(getNip05DisplayIdentifier('alice@example.com')).toBe('alice@example.com');
    });

    test('returns undefined for invalid identifiers', () => {
        expect(getNip05DisplayIdentifier('example.com')).toBeUndefined();
    });
});
