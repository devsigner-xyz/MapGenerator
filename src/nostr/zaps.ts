import type { NostrProfile, NostrEvent } from './types';
import { bech32 } from '@scure/base';

interface PublishGatewayLike {
    publishEvent(event: {
        kind: number;
        content: string;
        created_at: number;
        tags: string[][];
    }): Promise<NostrEvent>;
}

interface FetchLikeResponse {
    ok: boolean;
    json(): Promise<unknown>;
}

interface RequestProfileZapInvoiceInput {
    amountSats: number;
    profilePubkey: string;
    profile: NostrProfile | undefined;
    relays: string[];
    writeGateway: PublishGatewayLike;
    fetchFn?: (input: string) => Promise<FetchLikeResponse>;
    now?: () => number;
}

interface LnurlPayMetadata {
    callback: string;
    allowsNostr: boolean;
    nostrPubkey?: string;
    minSendable?: number;
    maxSendable?: number;
}

export function profileHasZapEndpoint(profile: NostrProfile | undefined): boolean {
    return Boolean(profile?.lud16 || profile?.lud06);
}

export function buildLightningAddressUrl(lud16: string): string {
    const [name, domain] = lud16.trim().split('@');
    if (!name || !domain) {
        throw new Error('Invalid lud16');
    }

    return `https://${domain}/.well-known/lnurlp/${name}`;
}

function encodeLnurl(url: string): string {
    return bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode(url)), 2000);
}

function resolveLnurlPayUrl(profile: NostrProfile | undefined): string {
    if (profile?.lud16) {
        return buildLightningAddressUrl(profile.lud16);
    }

    if (profile?.lud06) {
        const decoded = bech32.decode(profile.lud06 as `${string}1${string}`, 2000);
        return new TextDecoder().decode(Uint8Array.from(bech32.fromWords(decoded.words)));
    }

    throw new Error('Profile does not expose a zap endpoint');
}

function parseMetadata(value: unknown): LnurlPayMetadata {
    if (!value || typeof value !== 'object') {
        throw new Error('Invalid LNURL pay metadata');
    }

    const typed = value as Record<string, unknown>;
    return {
        callback: typeof typed.callback === 'string' ? typed.callback : '',
        allowsNostr: typed.allowsNostr === true,
        ...(typeof typed.nostrPubkey === 'string' ? { nostrPubkey: typed.nostrPubkey } : {}),
        ...(typeof typed.minSendable === 'number' ? { minSendable: typed.minSendable } : {}),
        ...(typeof typed.maxSendable === 'number' ? { maxSendable: typed.maxSendable } : {}),
    };
}

export async function requestProfileZapInvoice(input: RequestProfileZapInvoiceInput): Promise<string> {
    const fetchFn = input.fetchFn ?? (async (url: string) => fetch(url) as Promise<FetchLikeResponse>);
    const now = input.now ?? (() => Math.floor(Date.now() / 1000));
    const lnurlUrl = resolveLnurlPayUrl(input.profile);
    const metadataResponse = await fetchFn(lnurlUrl);
    if (!metadataResponse.ok) {
        throw new Error('Failed to fetch LNURL pay metadata');
    }

    const metadata = parseMetadata(await metadataResponse.json());
    const amountMsats = Math.round(input.amountSats * 1000);
    if (!metadata.callback || !metadata.allowsNostr || !metadata.nostrPubkey) {
        throw new Error('Target is not zap compatible');
    }
    if ((metadata.minSendable ?? 0) > amountMsats || (metadata.maxSendable ?? Number.MAX_SAFE_INTEGER) < amountMsats) {
        throw new Error('Requested amount is outside LNURL pay bounds');
    }

    const encodedLnurl = encodeLnurl(lnurlUrl);
    const signedZapRequest = await input.writeGateway.publishEvent({
        kind: 9734,
        content: '',
        created_at: now(),
        tags: [
            ['relays', ...input.relays],
            ['p', input.profilePubkey],
            ['amount', String(amountMsats)],
            ['lnurl', encodedLnurl],
        ],
    });

    const callbackUrl = new URL(metadata.callback);
    callbackUrl.searchParams.set('amount', String(amountMsats));
    callbackUrl.searchParams.set('nostr', JSON.stringify(signedZapRequest));
    callbackUrl.searchParams.set('lnurl', encodedLnurl);

    const invoiceResponse = await fetchFn(callbackUrl.toString());
    if (!invoiceResponse.ok) {
        throw new Error('Failed to fetch zap invoice');
    }

    const invoicePayload = await invoiceResponse.json() as { pr?: unknown };
    if (typeof invoicePayload.pr !== 'string' || invoicePayload.pr.length === 0) {
        throw new Error('Zap invoice response did not include a payment request');
    }

    return invoicePayload.pr;
}
