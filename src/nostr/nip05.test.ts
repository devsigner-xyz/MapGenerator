import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    __resetNip05ValidationCacheForTests,
    getNip05DisplayIdentifier,
    parseNip05Identifier,
    validateNip05Identifier,
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

describe('validateNip05Identifier', () => {
    const pubkey = 'a'.repeat(64);

    beforeEach(() => {
        __resetNip05ValidationCacheForTests();
    });

    test('returns verified when names map matches pubkey', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ names: { alice: pubkey } }),
        });

        const result = await validateNip05Identifier({
            pubkey,
            nip05: 'alice@example.com',
            fetchImpl: fetchMock,
        });

        expect(result.status).toBe('verified');
        expect(result.resolvedPubkey).toBe(pubkey);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/.well-known/nostr.json?name=alice');
    });

    test('returns unverified when resolved pubkey does not match', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ names: { alice: 'b'.repeat(64) } }),
        });

        const result = await validateNip05Identifier({
            pubkey,
            nip05: 'alice@example.com',
            fetchImpl: fetchMock,
        });

        expect(result.status).toBe('unverified');
        expect(result.resolvedPubkey).toBe('b'.repeat(64));
    });

    test('returns unverified when identifier format is invalid', async () => {
        const fetchMock = vi.fn();
        const result = await validateNip05Identifier({
            pubkey,
            nip05: 'example.com',
            fetchImpl: fetchMock,
        });

        expect(result.status).toBe('unverified');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('returns error when network request fails', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        const result = await validateNip05Identifier({
            pubkey,
            nip05: 'alice@example.com',
            fetchImpl: fetchMock,
        });

        expect(result.status).toBe('error');
        expect(result.error).toContain('network down');
    });

    test('dedupes concurrent validations for same pubkey+identifier', async () => {
        let resolveFetch: ((value: unknown) => void) | undefined;
        const fetchPromise = new Promise((resolve) => {
            resolveFetch = resolve;
        });

        const fetchMock = vi.fn().mockReturnValue(fetchPromise);

        const firstPromise = validateNip05Identifier({
            pubkey,
            nip05: 'alice@example.com',
            fetchImpl: fetchMock,
        });
        const secondPromise = validateNip05Identifier({
            pubkey,
            nip05: 'alice@example.com',
            fetchImpl: fetchMock,
        });

        resolveFetch?.({
            ok: true,
            json: async () => ({ names: { alice: pubkey } }),
        });

        const [first, second] = await Promise.all([firstPromise, secondPromise]);
        expect(first.status).toBe('verified');
        expect(second.status).toBe('verified');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('serves cached success without additional fetches', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ names: { alice: pubkey } }),
        });

        const first = await validateNip05Identifier({
            pubkey,
            nip05: 'alice@example.com',
            fetchImpl: fetchMock,
        });
        const second = await validateNip05Identifier({
            pubkey,
            nip05: 'alice@example.com',
            fetchImpl: fetchMock,
        });

        expect(first.status).toBe('verified');
        expect(second.status).toBe('verified');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
