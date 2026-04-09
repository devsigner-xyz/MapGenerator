import { normalizeRelayUrl } from '../../../relay-policy';

const HEX64_LOWER = /^[a-f0-9]{64}$/;

export interface ParsedBunkerUri {
    type: 'bunker';
    remoteSignerPubkey: string;
    relays: string[];
    secret?: string;
}

export interface ParsedNostrConnectUri {
    type: 'nostrconnect';
    clientPubkey: string;
    relays: string[];
    secret: string;
    perms: string[];
    name?: string;
    url?: string;
    image?: string;
}

export type ParsedNip46Uri = ParsedBunkerUri | ParsedNostrConnectUri;

function parsePubkeyFromHost(url: URL): string {
    const pubkey = url.host;
    if (!HEX64_LOWER.test(pubkey)) {
        throw new Error('NIP-46 URI pubkey must be 64-char lowercase hex');
    }
    return pubkey;
}

function parseRelays(params: URLSearchParams): string[] {
    const relays = params.getAll('relay');
    if (relays.length === 0) {
        throw new Error('bunker uri requires at least one relay');
    }

    const normalized = relays.map((relay) => normalizeRelayUrl(relay));
    if (normalized.some((value) => value === null)) {
        throw new Error('NIP-46 URI contains invalid relay URL');
    }

    return [...new Set(normalized as string[])];
}

function parsePerms(params: URLSearchParams): string[] {
    const raw = params.get('perms');
    if (!raw) {
        return [];
    }

    return raw
        .split(',')
        .map((permission) => permission.trim())
        .filter((permission) => permission.length > 0);
}

export function parseNip46Uri(input: string): ParsedNip46Uri {
    const value = input.trim();
    let parsed: URL;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error('Invalid NIP-46 URI');
    }

    if (parsed.protocol !== 'bunker:' && parsed.protocol !== 'nostrconnect:') {
        throw new Error('Unsupported NIP-46 URI scheme');
    }

    const pubkey = parsePubkeyFromHost(parsed);
    const relays = parseRelays(parsed.searchParams);

    if (parsed.protocol === 'bunker:') {
        const secret = parsed.searchParams.get('secret') || undefined;
        return {
            type: 'bunker',
            remoteSignerPubkey: pubkey,
            relays,
            secret,
        };
    }

    const secret = parsed.searchParams.get('secret');
    if (!secret) {
        throw new Error('nostrconnect uri requires secret parameter');
    }

    const name = parsed.searchParams.get('name') || undefined;
    const url = parsed.searchParams.get('url') || undefined;
    const image = parsed.searchParams.get('image') || undefined;

    return {
        type: 'nostrconnect',
        clientPubkey: pubkey,
        relays,
        secret,
        perms: parsePerms(parsed.searchParams),
        name,
        url,
        image,
    };
}
