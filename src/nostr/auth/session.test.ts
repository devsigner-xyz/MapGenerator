import { describe, expect, test } from 'vitest';
import {
    createAuthSession,
    defaultCapabilitiesForMethod,
    isEncryptionEnabled,
    isSessionReady,
    isWriteEnabled,
    type AuthSessionState,
} from './session';

function buildSession(overrides: Partial<AuthSessionState> = {}): AuthSessionState {
    return {
        method: 'nsec',
        pubkey: 'f'.repeat(64),
        readonly: false,
        locked: false,
        capabilities: {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip04', 'nip44'],
        },
        createdAt: 123,
        ...overrides,
    };
}

describe('defaultCapabilitiesForMethod', () => {
    test('returns readonly capabilities for npub', () => {
        expect(defaultCapabilitiesForMethod('npub')).toEqual({
            canSign: false,
            canEncrypt: false,
            encryptionSchemes: [],
        });
    });

    test('returns signing and encryption capabilities for nsec', () => {
        expect(defaultCapabilitiesForMethod('nsec')).toEqual({
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip04', 'nip44'],
        });
    });
});

describe('createAuthSession', () => {
    test('creates readonly session for npub method', () => {
        const session = createAuthSession({
            method: 'npub',
            pubkey: 'a'.repeat(64),
            createdAt: 999,
        });

        expect(session.readonly).toBe(true);
        expect(session.locked).toBe(false);
        expect(session.capabilities.canSign).toBe(false);
    });

    test('creates locked session when lock flag is true', () => {
        const session = createAuthSession({
            method: 'nsec',
            pubkey: 'b'.repeat(64),
            locked: true,
        });

        expect(session.locked).toBe(true);
    });
});

describe('session helpers', () => {
    test('isSessionReady returns false when session is undefined', () => {
        expect(isSessionReady(undefined)).toBe(false);
    });

    test('isSessionReady returns true for valid session', () => {
        expect(isSessionReady(buildSession())).toBe(true);
    });

    test('isWriteEnabled returns false when readonly', () => {
        expect(isWriteEnabled(buildSession({ readonly: true }))).toBe(false);
    });

    test('isWriteEnabled returns false when locked', () => {
        expect(isWriteEnabled(buildSession({ locked: true }))).toBe(false);
    });

    test('isWriteEnabled returns true when signer is available and unlocked', () => {
        expect(isWriteEnabled(buildSession())).toBe(true);
    });

    test('isEncryptionEnabled checks encryption capability and scheme', () => {
        const session = buildSession();
        expect(isEncryptionEnabled(session, 'nip44')).toBe(true);
        expect(isEncryptionEnabled(session, 'nip04')).toBe(true);
        expect(isEncryptionEnabled(session, 'unknown')).toBe(false);
    });

    test('isEncryptionEnabled returns false in readonly sessions', () => {
        expect(isEncryptionEnabled(buildSession({ readonly: true }), 'nip44')).toBe(false);
    });
});
