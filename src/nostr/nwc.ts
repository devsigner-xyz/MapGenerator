import { nip04, nip44, verifyEvent } from 'nostr-tools';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { normalizeRelayUrl } from './relay-policy';
import type { NostrEvent, NostrFilter } from './types';
import type { NwcWalletConnection, WalletCapabilities } from './wallet-types';

const HEX64_LOWER = /^[a-f0-9]{64}$/;

export interface ParsedNwcConnectionUri {
    uri: string;
    walletServicePubkey: string;
    relays: string[];
    secret: string;
}

export interface NwcIo {
    publish(event: NostrEvent, relays: string[]): Promise<void>;
    subscribe(filter: NostrFilter, handler: (event: NostrEvent) => void): () => void;
    close?(): void;
}

interface CreateNwcClientInput {
    connection: NwcWalletConnection;
    io: NwcIo;
    now?: () => number;
    timeoutMs?: number;
    encrypt?: (plaintext: string) => Promise<string>;
    decrypt?: (ciphertext: string) => Promise<string>;
    verifyEvent?: (event: NostrEvent) => boolean;
}

function hexToBytes(value: string): Uint8Array {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
        bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

export function parseNwcConnectionUri(input: string): ParsedNwcConnectionUri {
    const value = input.trim();
    let parsed: URL;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error('Invalid NWC URI');
    }

    if (parsed.protocol !== 'nostr+walletconnect:') {
        throw new Error('Unsupported NWC URI scheme');
    }

    const walletServicePubkey = parsed.host.trim().toLowerCase();
    if (!HEX64_LOWER.test(walletServicePubkey)) {
        throw new Error('NWC URI pubkey must be 64-char lowercase hex');
    }

    const secret = (parsed.searchParams.get('secret') || '').trim().toLowerCase();
    if (!HEX64_LOWER.test(secret)) {
        throw new Error('NWC URI secret must be 32-byte hex');
    }

    const relays = [...new Set(parsed.searchParams.getAll('relay')
        .map((relay) => normalizeRelayUrl(relay))
        .filter((relay): relay is string => relay !== null))];
    if (relays.length === 0) {
        throw new Error('NWC URI requires at least one relay');
    }

    return {
        uri: value,
        walletServicePubkey,
        relays,
        secret,
    };
}

export function resolveNwcInfoCapabilities(content: string): WalletCapabilities {
    const tokens = [...new Set(content.split(/\s+/).map((item) => item.trim()).filter(Boolean))];
    return {
        payInvoice: tokens.includes('pay_invoice'),
        makeInvoice: tokens.includes('make_invoice'),
        notifications: tokens.includes('notifications'),
    };
}

export function resolveNwcEncryptionMode(tags: string[][]): 'nip44_v2' | 'nip04' {
    const supported = new Set<string>();
    for (const tag of tags) {
        if (tag[0] !== 'encryption') {
            continue;
        }

        for (const token of (tag[1] || '').split(/\s+/)) {
            const normalized = token.trim();
            if (normalized) {
                supported.add(normalized);
            }
        }
    }

    if (supported.has('nip44_v2')) {
        return 'nip44_v2';
    }

    if (supported.size > 0 && !supported.has('nip04')) {
        throw new Error('NWC info event does not advertise a supported encryption mode');
    }

    return 'nip04';
}

export function getNwcClientPubkey(secret: string): string {
    if (!HEX64_LOWER.test(secret)) {
        throw new Error('NWC URI secret must be 32-byte hex');
    }

    return getPublicKey(hexToBytes(secret));
}

function getNip44ConversationKey(secret: string, remotePubkey: string): Uint8Array {
    return nip44.v2.utils.getConversationKey(hexToBytes(secret), remotePubkey);
}

function createDefaultEncryptor(connection: NwcWalletConnection): (plaintext: string) => Promise<string> {
    if (connection.encryption === 'nip44_v2') {
        return async (plaintext: string) => {
            return nip44.v2.encrypt(plaintext, getNip44ConversationKey(connection.secret, connection.walletServicePubkey));
        };
    }

    return async (plaintext: string) => nip04.encrypt(connection.secret, connection.walletServicePubkey, plaintext);
}

function createDefaultDecryptor(connection: NwcWalletConnection): (ciphertext: string) => Promise<string> {
    if (connection.encryption === 'nip44_v2') {
        return async (ciphertext: string) => {
            return nip44.v2.decrypt(ciphertext, getNip44ConversationKey(connection.secret, connection.walletServicePubkey));
        };
    }

    return async (ciphertext: string) => nip04.decrypt(connection.secret, connection.walletServicePubkey, ciphertext);
}

function parseResponsePayload(payload: string): {
    result_type: string;
    result?: Record<string, unknown>;
    error?: { code?: string; message?: string } | null;
} {
    const parsed = JSON.parse(payload) as {
        result_type?: unknown;
        result?: unknown;
        error?: unknown;
    };
    if (typeof parsed.result_type !== 'string' || parsed.result_type.length === 0) {
        throw new Error('NWC response result_type is required');
    }

    return {
        result_type: parsed.result_type,
        ...(parsed.result && typeof parsed.result === 'object' ? { result: parsed.result as Record<string, unknown> } : {}),
        ...(parsed.error === null || (parsed.error && typeof parsed.error === 'object')
            ? { error: parsed.error as { code?: string; message?: string } | null }
            : {}),
    };
}

export function createNwcClient(input: CreateNwcClientInput) {
    const now = input.now ?? (() => Math.floor(Date.now() / 1000));
    const timeoutMs = input.timeoutMs ?? 90_000;
    const localPubkey = getNwcClientPubkey(input.connection.secret);
    const encrypt = input.encrypt ?? createDefaultEncryptor(input.connection);
    const decrypt = input.decrypt ?? createDefaultDecryptor(input.connection);
    const verify = input.verifyEvent ?? verifyEvent;

    const call = async (method: string, params: Record<string, unknown>) => {
        const createdAt = now();
        const signedEvent = finalizeEvent({
            kind: 23194,
            created_at: createdAt,
            tags: [
                ['p', input.connection.walletServicePubkey],
                ['expiration', String(createdAt + 60)],
                ...(input.connection.encryption === 'nip44_v2' ? [['encryption', 'nip44_v2']] : []),
            ],
            content: await encrypt(JSON.stringify({ method, params })),
        }, hexToBytes(input.connection.secret)) as unknown as NostrEvent;

        return new Promise<Record<string, unknown>>((resolve, reject) => {
            const unsubscribe = input.io.subscribe({
                authors: [input.connection.walletServicePubkey],
                kinds: [23195],
                '#p': [localPubkey],
                '#e': [signedEvent.id],
                limit: 20,
            }, (event) => {
                if (!verify(event as Parameters<typeof verifyEvent>[0])) {
                    return;
                }
                if (!event.tags.some((tag) => tag[0] === 'p' && tag[1] === localPubkey)) {
                    return;
                }
                if (!event.tags.some((tag) => tag[0] === 'e' && tag[1] === signedEvent.id)) {
                    return;
                }

                void decrypt(event.content)
                    .then((plaintext) => {
                        const payload = parseResponsePayload(plaintext);
                        if (payload.result_type !== method) {
                            return;
                        }

                        unsubscribe();
                        window.clearTimeout(timeoutId);

                        if (payload.error?.message) {
                            reject(new Error(payload.error.message));
                            return;
                        }

                        resolve(payload.result ?? {});
                    })
                    .catch(() => undefined);
            });

            const timeoutId = window.setTimeout(() => {
                unsubscribe();
                reject(new Error('NWC request timed out'));
            }, timeoutMs);

            void input.io.publish(signedEvent, input.connection.relays).catch((error) => {
                unsubscribe();
                window.clearTimeout(timeoutId);
                reject(error instanceof Error ? error : new Error('Failed to publish NWC request'));
            });
        });
    };

    return {
        async payInvoice(invoice: string): Promise<{ preimage: string; feesPaidMsats?: number }> {
            const result = await call('pay_invoice', { invoice });
            if (typeof result.preimage !== 'string' || result.preimage.length === 0) {
                throw new Error('NWC pay_invoice response did not include a preimage');
            }

            return {
                preimage: result.preimage,
                ...(typeof result.fees_paid === 'number' ? { feesPaidMsats: result.fees_paid } : {}),
            };
        },

        async makeInvoice(inputAmount: { amountMsats: number }): Promise<{ invoice: string; expiresAt?: number }> {
            const result = await call('make_invoice', { amount: inputAmount.amountMsats });
            if (typeof result.invoice !== 'string' || result.invoice.length === 0) {
                throw new Error('NWC make_invoice response did not include an invoice');
            }

            return {
                invoice: result.invoice,
                ...(typeof result.expires_at === 'number' ? { expiresAt: result.expires_at } : {}),
            };
        },
    };
}

export function createNwcRelayIo(relays: string[]): NwcIo {
    const pool = new SimplePool();

    return {
        async publish(event: NostrEvent, relayUrls: string[]) {
            const attempts = await Promise.allSettled(
                pool.publish(relayUrls.length > 0 ? relayUrls : relays, event as Parameters<typeof pool.publish>[1])
            );
            if (!attempts.some((result) => result.status === 'fulfilled')) {
                throw new Error('Failed to publish NWC request');
            }
        },
        subscribe(filter: NostrFilter, handler: (event: NostrEvent) => void) {
            const subscription = pool.subscribe(relays, filter as Parameters<typeof pool.subscribe>[1], {
                onevent(event: NostrEvent) {
                    handler(event);
                },
            });

            return () => {
                void subscription.close();
            };
        },
        close() {
            pool.close(relays);
        },
    };
}
