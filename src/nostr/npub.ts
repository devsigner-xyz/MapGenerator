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

export function decodeNsecToHex(nsec: string): string {
    try {
        const decoded = nip19.decode(nsec);
        if (decoded.type !== 'nsec') {
            throw new Error('Provided identifier is not an nsec key');
        }

        const privateKey = decoded.data;
        const privateKeyHex =
            typeof privateKey === 'string'
                ? privateKey
                : Array.from(privateKey)
                      .map((value) => value.toString(16).padStart(2, '0'))
                      .join('');

        if (!isHexKey(privateKeyHex)) {
            throw new Error('Decoded nsec did not produce a valid 64-char hex private key');
        }

        return privateKeyHex;
    } catch {
        throw new Error('Provided identifier is not an nsec key');
    }
}
