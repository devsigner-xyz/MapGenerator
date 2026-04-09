import { describe, expect, test } from 'vitest';
import {
    capabilitiesFromNip46Permissions,
    isNip46CallAllowed,
    parseNip46Permissions,
} from './permissions';

describe('parseNip46Permissions', () => {
    test('parses method and optional parameter constraints', () => {
        const parsed = parseNip46Permissions(['nip44_encrypt', 'sign_event:1', 'sign_event:6']);

        expect(parsed).toEqual([
            { method: 'nip44_encrypt', constraint: undefined },
            { method: 'sign_event', constraint: '1' },
            { method: 'sign_event', constraint: '6' },
        ]);
    });

    test('normalizes whitespace and removes empty tokens', () => {
        const parsed = parseNip46Permissions([' nip44_encrypt ', '', 'sign_event:1']);
        expect(parsed).toHaveLength(2);
    });
});

describe('isNip46CallAllowed', () => {
    test('allows all methods when no permissions are declared', () => {
        expect(isNip46CallAllowed([], 'sign_event', '1')).toBe(true);
        expect(isNip46CallAllowed([], 'nip44_encrypt')).toBe(true);
    });

    test('enforces method and constraint matching', () => {
        const permissions = parseNip46Permissions(['sign_event:1', 'nip44_encrypt']);

        expect(isNip46CallAllowed(permissions, 'sign_event', '1')).toBe(true);
        expect(isNip46CallAllowed(permissions, 'sign_event', '4')).toBe(false);
        expect(isNip46CallAllowed(permissions, 'nip44_encrypt')).toBe(true);
        expect(isNip46CallAllowed(permissions, 'nip44_decrypt')).toBe(false);
    });
});

describe('capabilitiesFromNip46Permissions', () => {
    test('defaults to full capabilities when permission list is empty', () => {
        expect(capabilitiesFromNip46Permissions([])).toEqual({
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip04', 'nip44'],
        });
    });

    test('derives capabilities from explicit permissions', () => {
        expect(capabilitiesFromNip46Permissions(['sign_event:1', 'nip44_encrypt', 'nip44_decrypt'])).toEqual({
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip44'],
        });

        expect(capabilitiesFromNip46Permissions(['nip44_encrypt'])).toEqual({
            canSign: false,
            canEncrypt: false,
            encryptionSchemes: [],
        });
    });
});
