import { nip19 } from 'nostr-tools';

export function isHexKey(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value);
}

export function encodeHexToNpub(pubkey: string): string {
    if (!isHexKey(pubkey)) {
        throw new Error('Provided pubkey is not a valid 64-char hex value');
    }

    return nip19.npubEncode(pubkey);
}

export function decodeNpubToHex(npub: string): string {
    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub') {
        throw new Error('Provided identifier is not an npub key');
    }

    const pubkey = decoded.data;
    if (typeof pubkey !== 'string' || !isHexKey(pubkey)) {
        throw new Error('Decoded npub did not produce a valid 64-char hex pubkey');
    }

    return pubkey;
}
