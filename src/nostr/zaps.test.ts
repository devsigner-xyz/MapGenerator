import { describe, expect, test, vi } from 'vitest';
import { bech32 } from '@scure/base';
import { buildLightningAddressUrl, profileHasZapEndpoint, requestProfileZapInvoice } from './zaps';

describe('zaps', () => {
    test('builds lnurlp url from lud16', () => {
        expect(buildLightningAddressUrl('alice@getalby.com')).toBe('https://getalby.com/.well-known/lnurlp/alice');
    });

    test('detects whether a profile exposes zap endpoint metadata', () => {
        expect(profileHasZapEndpoint(undefined)).toBe(false);
        expect(profileHasZapEndpoint({ pubkey: 'a'.repeat(64) })).toBe(false);
        expect(profileHasZapEndpoint({ pubkey: 'a'.repeat(64), lud16: 'alice@getalby.com' })).toBe(true);
        expect(profileHasZapEndpoint({ pubkey: 'a'.repeat(64), lud06: 'lnurl1dp68gurn8ghj7' })).toBe(true);
    });

    test('falls back to lud06 when lud16 is missing', async () => {
        const lnurl = 'https://getalby.com/.well-known/lnurlp/alice';
        const lud06 = bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode(lnurl)), 2000);
        const fetchFn = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    callback: 'https://wallet.example/cb',
                    allowsNostr: true,
                    nostrPubkey: 'b'.repeat(64),
                    minSendable: 1_000,
                    maxSendable: 1_000_000,
                }),
            })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ pr: 'lnbc1invoice' }) });

        await requestProfileZapInvoice({
            amountSats: 21,
            profilePubkey: 'a'.repeat(64),
            profile: { pubkey: 'a'.repeat(64), lud06 },
            relays: ['wss://relay.one.example'],
            writeGateway: {
                publishEvent: vi.fn(async (event) => ({
                    ...event,
                    id: 'e'.repeat(64),
                    pubkey: 'f'.repeat(64),
                    sig: 'c'.repeat(128),
                })),
            },
            fetchFn,
            now: () => 100,
        });

        expect(String(fetchFn.mock.calls[0]?.[0])).toBe(lnurl);
    });

    test('requests a profile zap invoice with a signed 9734 event', async () => {
        const encodedLnurl = bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode('https://getalby.com/.well-known/lnurlp/alice')), 2000);
        const fetchFn = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    callback: 'https://wallet.example/cb',
                    allowsNostr: true,
                    nostrPubkey: 'b'.repeat(64),
                    minSendable: 1_000,
                    maxSendable: 1_000_000,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ pr: 'lnbc1invoice' }),
            });
        const publishEvent = vi.fn(async (event) => ({
            ...event,
            id: 'e'.repeat(64),
            pubkey: 'f'.repeat(64),
            sig: 'c'.repeat(128),
        }));

        const invoice = await requestProfileZapInvoice({
            amountSats: 21,
            profilePubkey: 'a'.repeat(64),
            profile: { pubkey: 'a'.repeat(64), lud16: 'alice@getalby.com' },
            relays: ['wss://relay.one.example'],
            writeGateway: { publishEvent },
            fetchFn,
            now: () => 100,
        });

        expect(invoice).toBe('lnbc1invoice');
        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            kind: 9734,
            created_at: 100,
            content: '',
            tags: expect.arrayContaining([
                ['p', 'a'.repeat(64)],
                ['amount', '21000'],
                ['lnurl', encodedLnurl],
            ]),
        }));
        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(String(fetchFn.mock.calls[1]?.[0])).toContain('amount=21000');
        expect(String(fetchFn.mock.calls[1]?.[0])).toContain('nostr=');
        expect(String(fetchFn.mock.calls[1]?.[0])).toContain(`lnurl=${encodeURIComponent(encodedLnurl)}`);
    });
});
