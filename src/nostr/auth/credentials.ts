import { decodeNpubToHex, decodeNsecToHex, isHexKey } from '../npub';

export type CredentialKind = 'npub' | 'nsec' | 'hex' | 'bunker' | 'unknown';

interface BaseParsedCredential {
    kind: Exclude<CredentialKind, 'unknown'>;
    original: string;
}

export interface ParsedNpubCredential extends BaseParsedCredential {
    kind: 'npub';
    pubkeyHex: string;
}

export interface ParsedNsecCredential extends BaseParsedCredential {
    kind: 'nsec';
    privateKeyHex: string;
}

export interface ParsedHexCredential extends BaseParsedCredential {
    kind: 'hex';
    hex: string;
}

export interface ParsedBunkerCredential extends BaseParsedCredential {
    kind: 'bunker';
    bunkerUri: string;
}

export type ParsedCredential =
    | ParsedNpubCredential
    | ParsedNsecCredential
    | ParsedHexCredential
    | ParsedBunkerCredential;

function normalizeCredentialInput(value: string): string {
    return value.trim();
}

export function detectCredentialKind(value: string): CredentialKind {
    const normalized = normalizeCredentialInput(value);

    if (normalized.startsWith('npub1')) {
        return 'npub';
    }

    if (normalized.startsWith('nsec1')) {
        return 'nsec';
    }

    if (normalized.startsWith('bunker://')) {
        return 'bunker';
    }

    if (isHexKey(normalized.toLowerCase())) {
        return 'hex';
    }

    return 'unknown';
}

export function parseCredential(value: string): ParsedCredential {
    const original = normalizeCredentialInput(value);
    const kind = detectCredentialKind(original);

    if (kind === 'npub') {
        return {
            kind,
            original,
            pubkeyHex: decodeNpubToHex(original),
        };
    }

    if (kind === 'nsec') {
        return {
            kind,
            original,
            privateKeyHex: decodeNsecToHex(original),
        };
    }

    if (kind === 'hex') {
        return {
            kind,
            original,
            hex: original.toLowerCase(),
        };
    }

    if (kind === 'bunker') {
        return {
            kind,
            original,
            bunkerUri: original,
        };
    }

    throw new Error('Unsupported credential format');
}
