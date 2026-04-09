import { describe, expect, test } from 'vitest';
import {
    type CredentialKind,
    detectCredentialKind,
    parseCredential,
    type ParsedCredential,
} from './credentials';

const SAMPLE_NPUB = 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw';
const SAMPLE_NSEC = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
const SAMPLE_HEX = 'f'.repeat(64);

function expectKind(input: string, kind: CredentialKind) {
    expect(detectCredentialKind(input)).toBe(kind);
}

describe('detectCredentialKind', () => {
    test('detects npub, nsec, hex and bunker markers', () => {
        expectKind(SAMPLE_NPUB, 'npub');
        expectKind(SAMPLE_NSEC, 'nsec');
        expectKind(SAMPLE_HEX, 'hex');
        expectKind('bunker://abc?relay=wss://relay.example.com', 'bunker');
        expectKind('nostrconnect://abc?relay=wss://relay.example.com&secret=test', 'bunker');
    });

    test('returns unknown when marker is unsupported', () => {
        expectKind('note1something', 'unknown');
    });
});

describe('parseCredential', () => {
    test('parses npub into hex and preserves original value', () => {
        const parsed = parseCredential(SAMPLE_NPUB);
        expect(parsed.kind).toBe('npub');
        if (parsed.kind !== 'npub') {
            throw new Error('Expected npub credential');
        }

        expect(parsed.original).toBe(SAMPLE_NPUB);
        expect(parsed.pubkeyHex).toMatch(/^[a-f0-9]{64}$/);
    });

    test('parses nsec into hex and preserves original value', () => {
        const parsed = parseCredential(SAMPLE_NSEC);
        expect(parsed.kind).toBe('nsec');
        if (parsed.kind !== 'nsec') {
            throw new Error('Expected nsec credential');
        }

        expect(parsed.original).toBe(SAMPLE_NSEC);
        expect(parsed.privateKeyHex).toBe('67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa');
    });

    test('parses hex and normalizes to lowercase', () => {
        const parsed = parseCredential('A'.repeat(64));
        expect(parsed.kind).toBe('hex');
        if (parsed.kind !== 'hex') {
            throw new Error('Expected hex credential');
        }

        expect(parsed.hex).toBe('a'.repeat(64));
    });

    test('parses bunker marker as nip46 candidate', () => {
        const signerPubkey = 'a'.repeat(64);
        const uri = `bunker://${signerPubkey}?relay=wss://relay.example.com`;
        const parsed = parseCredential(uri);

        expect(parsed.kind).toBe('bunker');
        if (parsed.kind !== 'bunker') {
            throw new Error('Expected bunker credential');
        }

        expect(parsed.original).toBe(uri);
        expect(parsed.bunkerUri).toBe(uri);
        expect(parsed.parsedNip46.type).toBe('bunker');
        if (parsed.parsedNip46.type !== 'bunker') {
            throw new Error('Expected bunker URI parsing result');
        }

        expect(parsed.parsedNip46.remoteSignerPubkey).toBe(signerPubkey);
        expect(parsed.parsedNip46.relays).toEqual(['wss://relay.example.com']);
    });

    test('parses nostrconnect marker as nip46 candidate', () => {
        const clientPubkey = 'b'.repeat(64);
        const uri = `nostrconnect://${clientPubkey}?relay=wss://relay.example.com&secret=my-secret&perms=sign_event%3A1`;
        const parsed = parseCredential(uri);

        expect(parsed.kind).toBe('bunker');
        if (parsed.kind !== 'bunker') {
            throw new Error('Expected bunker credential');
        }

        expect(parsed.parsedNip46.type).toBe('nostrconnect');
        if (parsed.parsedNip46.type !== 'nostrconnect') {
            throw new Error('Expected nostrconnect URI parsing result');
        }

        expect(parsed.parsedNip46.clientPubkey).toBe(clientPubkey);
        expect(parsed.parsedNip46.secret).toBe('my-secret');
        expect(parsed.parsedNip46.perms).toEqual(['sign_event:1']);
    });

    test('throws for unsupported credential format', () => {
        expect(() => parseCredential('invalid-key-value')).toThrow('Unsupported credential format');
    });

    test('throws for invalid nsec even if it has nsec prefix', () => {
        expect(() => parseCredential('nsec1invalid')).toThrow('Provided identifier is not an nsec key');
    });

    test('throws for invalid bunker uri payload', () => {
        expect(() => parseCredential(`bunker://${'a'.repeat(64)}`)).toThrow(
            'bunker uri requires at least one relay'
        );
    });
});
