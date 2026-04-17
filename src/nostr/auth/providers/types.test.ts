import { describe, expect, test } from 'vitest';
import {
    AuthProviderError,
    AUTH_PROVIDER_ERROR,
    capabilitiesForMethod,
    methodSupports,
} from './types';

describe('AuthProviderError', () => {
    test('stores standardized auth provider error code', () => {
        const error = new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_READONLY, 'Cannot sign in readonly mode');

        expect(error.code).toBe(AUTH_PROVIDER_ERROR.AUTH_READONLY);
        expect(error.message).toBe('Cannot sign in readonly mode');
    });
});

describe('capabilitiesForMethod', () => {
    test('returns readonly capabilities for npub', () => {
        expect(capabilitiesForMethod('npub')).toEqual({
            canSign: false,
            canEncrypt: false,
            encryptionSchemes: [],
        });
    });

    test('returns signing-only capabilities for nip46 by default', () => {
        expect(capabilitiesForMethod('nip46')).toEqual({
            canSign: true,
            canEncrypt: false,
            encryptionSchemes: [],
        });
    });

    test('returns signing-only capabilities for nip07 by default', () => {
        expect(capabilitiesForMethod('nip07')).toEqual({
            canSign: true,
            canEncrypt: false,
            encryptionSchemes: [],
        });
    });
});

describe('methodSupports', () => {
    test('checks capability matrix by method', () => {
        expect(methodSupports('npub', 'sign')).toBe(false);
        expect(methodSupports('npub', 'encrypt')).toBe(false);
        expect(methodSupports('nip46', 'sign')).toBe(true);
        expect(methodSupports('nip46', 'encrypt')).toBe(false);
        expect(methodSupports('nip07', 'sign')).toBe(true);
        expect(methodSupports('nip07', 'encrypt')).toBe(false);
    });
});
