import { describe, expect, test, vi } from 'vitest';
import { createSocialPublisher } from './social-publisher';
import { createWriteGateway } from '../nostr/write-gateway';

describe('social publisher', () => {
    test('forwards signed events to social relays and returns the signed event when at least one relay acks', async () => {
        const publishEvent = vi.fn(async () => ({
            id: 'a'.repeat(64),
            pubkey: 'b'.repeat(64),
            kind: 1,
            created_at: 123,
            tags: [],
            content: 'hola',
            sig: 'c'.repeat(128),
        }));
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.one'],
            failedRelays: [],
            timeoutRelays: [],
        }));

        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent,
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.damus.io'],
        });

        const published = await publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        });

        expect(publishEvent).toHaveBeenCalledWith({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        });
        expect(forward).toHaveBeenCalledWith({
            event: published,
            relayScope: 'social',
            relays: ['wss://relay.damus.io'],
        });
        expect(published.id).toBe('a'.repeat(64));
    });

    test('fails when no relay acknowledges the event', async () => {
        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => ({
                    id: 'a'.repeat(64),
                    pubkey: 'b'.repeat(64),
                    kind: 1,
                    created_at: 123,
                    tags: [],
                    content: 'hola',
                    sig: 'c'.repeat(128),
                })),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: {
                forward: vi.fn(async () => ({
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: ['wss://relay.one'],
                })),
            },
            resolveRelays: () => ['wss://relay.one'],
        });

        await expect(publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        })).rejects.toThrow('No social relays acknowledged the event');
    });

    test('preserves writeGateway method binding when publishTextNote delegates through this.publishEvent', async () => {
        const writeGateway = createWriteGateway({
            getSession: () => ({
                method: 'nip07',
                pubkey: 'b'.repeat(64),
                readonly: false,
                locked: false,
                createdAt: 1,
                capabilities: {
                    canSign: true,
                    canEncrypt: false,
                    encryptionSchemes: [],
                },
            }),
            getProvider: () => ({
                signEvent: vi.fn(async (event) => ({
                    ...event,
                    id: 'a'.repeat(64),
                    pubkey: 'b'.repeat(64),
                    sig: 'c'.repeat(128),
                })),
            } as any),
        });
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.one'],
            failedRelays: [],
            timeoutRelays: [],
        }));

        const publisher = createSocialPublisher({
            writeGateway,
            publishForwardApi: { forward },
            resolveRelays: () => ['wss://relay.one'],
        });

        const published = await publisher.publishTextNote('hola ligada', []);

        expect(published.content).toBe('hola ligada');
        expect(forward).toHaveBeenCalledWith(expect.objectContaining({
            relayScope: 'social',
        }));
    });

    test('falls back to allowed bootstrap relays when resolved social relays are not allowed', async () => {
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay-0.example'],
            failedRelays: [],
            timeoutRelays: [],
        }));

        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => ({
                    id: 'a'.repeat(64),
                    pubkey: 'b'.repeat(64),
                    kind: 1,
                    created_at: 123,
                    tags: [],
                    content: 'hola',
                    sig: 'c'.repeat(128),
                })),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => Array.from({ length: 10 }, (_, index) => `wss://relay-${index}.example`),
        });

        await publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        });

        expect(forward).toHaveBeenCalledWith(expect.objectContaining({
            relayScope: 'social',
            relays: [
                'wss://relay.damus.io',
                'wss://relay.primal.net',
                'wss://nos.lol',
                'wss://relay.nostr.band',
            ],
        }));
    });

    test('filters social relays to the backend allowlist and falls back to allowed bootstrap relays', async () => {
        const forward = vi.fn(async () => ({
            ackedRelays: ['wss://relay.damus.io'],
            failedRelays: [],
            timeoutRelays: [],
        }));

        const publisher = createSocialPublisher({
            writeGateway: {
                publishEvent: vi.fn(async () => ({
                    id: 'a'.repeat(64),
                    pubkey: 'b'.repeat(64),
                    kind: 1,
                    created_at: 123,
                    tags: [],
                    content: 'hola',
                    sig: 'c'.repeat(128),
                })),
                publishTextNote: vi.fn(),
            },
            publishForwardApi: { forward },
            resolveRelays: () => [
                'wss://relay.snort.social',
                'wss://relay.bitcoiner.social',
            ],
        });

        await publisher.publishEvent({
            kind: 1,
            content: 'hola',
            created_at: 123,
            tags: [],
        });

        expect(forward).toHaveBeenCalledWith(expect.objectContaining({
            relayScope: 'social',
            relays: [
                'wss://relay.damus.io',
                'wss://relay.primal.net',
                'wss://nos.lol',
                'wss://relay.nostr.band',
            ],
        }));
    });
});
