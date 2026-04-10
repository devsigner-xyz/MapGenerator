import { describe, expect, test, vi } from 'vitest';
import {
    createNdkDmTransport,
    isPublishResultSuccessful,
    resolveRelayTargetsByTier,
    type RelayTierSources,
} from './dm-transport-ndk';
import type { NostrEvent } from './types';

function buildEvent(): NostrEvent {
    return {
        id: '1'.repeat(64),
        pubkey: '2'.repeat(64),
        kind: 1059,
        created_at: 100,
        tags: [['p', '3'.repeat(64)]],
        content: 'gift-wrap',
    };
}

describe('resolveRelayTargetsByTier', () => {
    test('prioritizes inbox/write over read over session and dedupes canonical relays', () => {
        const sources: RelayTierSources = {
            inboxWrite: ['wss://relay.one/', 'wss://relay.two'],
            read: ['wss://relay.two/', 'wss://relay.three?token=abc'],
            session: ['wss://relay.three', 'wss://relay.four#frag'],
        };

        const selection = resolveRelayTargetsByTier(sources);

        expect(selection.relays).toEqual([
            'wss://relay.one',
            'wss://relay.two',
            'wss://relay.three',
            'wss://relay.four',
        ]);
        expect(selection.tierByRelay).toEqual({
            'wss://relay.one': 'inboxWrite',
            'wss://relay.two': 'inboxWrite',
            'wss://relay.three': 'read',
            'wss://relay.four': 'session',
        });
        expect(selection.hasRecipientRelays).toBe(true);
    });
});

describe('createNdkDmTransport publish rules', () => {
    test('caps at six relays and uses 4 second timeout per relay', async () => {
        const publishRelay = vi.fn(async (relay: string, _event: NostrEvent, _timeoutMs: number) => {
            if (relay === 'wss://relay.one') {
                return { status: 'ack' as const };
            }

            if (relay === 'wss://relay.two') {
                return { status: 'failed' as const, reason: 'reject' };
            }

            return { status: 'timeout' as const };
        });

        const transport = createNdkDmTransport({
            publishRelay,
            subscribe: () => () => {
                return;
            },
            fetchBackfill: async () => [],
        });

        const result = await transport.publishToRelays(buildEvent(), [
            'wss://relay.one',
            'wss://relay.two',
            'wss://relay.three',
            'wss://relay.four',
            'wss://relay.five',
            'wss://relay.six',
            'wss://relay.seven',
            'wss://relay.one/',
            'https://invalid-relay.example',
        ]);

        expect(publishRelay).toHaveBeenCalledTimes(6);
        expect(publishRelay).toHaveBeenNthCalledWith(1, 'wss://relay.one', expect.any(Object), 4000);
        expect(publishRelay).toHaveBeenNthCalledWith(6, 'wss://relay.six', expect.any(Object), 4000);
        expect(result).toEqual({
            ackedRelays: ['wss://relay.one'],
            failedRelays: [{ relay: 'wss://relay.two', reason: 'reject' }],
            timeoutRelays: ['wss://relay.three', 'wss://relay.four', 'wss://relay.five', 'wss://relay.six'],
        });
    });
});

describe('isPublishResultSuccessful', () => {
    test('requires ack on inbox/write or read tiers when recipient relays exist', () => {
        const selection = resolveRelayTargetsByTier({
            inboxWrite: ['wss://relay.inbox'],
            read: ['wss://relay.read'],
            session: ['wss://relay.session'],
        });

        expect(
            isPublishResultSuccessful(
                {
                    ackedRelays: ['wss://relay.session'],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                selection
            )
        ).toBe(false);

        expect(
            isPublishResultSuccessful(
                {
                    ackedRelays: ['wss://relay.read'],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                selection
            )
        ).toBe(true);
    });

    test('allows ack on any tier when recipient relays do not exist', () => {
        const selection = resolveRelayTargetsByTier({
            inboxWrite: [],
            read: [],
            session: ['wss://relay.session'],
        });

        expect(
            isPublishResultSuccessful(
                {
                    ackedRelays: ['wss://relay.session'],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                selection
            )
        ).toBe(true);
    });
});

describe('createNdkDmTransport subscribe', () => {
    test('cleans up subscription when unsubscribe is called', () => {
        const cleanup = vi.fn();

        const transport = createNdkDmTransport({
            publishRelay: vi.fn(async () => ({ status: 'ack' as const })),
            subscribe: () => cleanup,
            fetchBackfill: async () => [],
        });

        const subscription = transport.subscribe([{ kinds: [1059] }], () => {
            return;
        });

        subscription.unsubscribe();
        subscription.unsubscribe();

        expect(cleanup).toHaveBeenCalledTimes(1);
    });
});
