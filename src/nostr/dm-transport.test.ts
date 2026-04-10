import { describe, expect, test } from 'vitest';
import type { NostrEvent } from './types';
import { createNoopDmTransport } from './dm-transport';

describe('dm transport contract', () => {
    test('exposes publish, subscribe and backfill methods', async () => {
        const transport = createNoopDmTransport();

        expect(typeof transport.publishToRelays).toBe('function');
        expect(typeof transport.subscribe).toBe('function');
        expect(typeof transport.fetchBackfill).toBe('function');

        const sampleEvent: NostrEvent = {
            id: '1'.repeat(64),
            pubkey: '2'.repeat(64),
            kind: 1059,
            created_at: 123,
            tags: [['p', '3'.repeat(64)]],
            content: 'payload',
        };

        const publishResult = await transport.publishToRelays(sampleEvent, ['wss://relay.one']);
        expect(publishResult).toMatchObject({
            ackedRelays: [],
            failedRelays: [{ relay: 'wss://relay.one', reason: 'not-implemented' }],
            timeoutRelays: [],
        });

        const subscription = transport.subscribe([{ kinds: [1059] }], () => {
            return;
        });
        expect(typeof subscription.unsubscribe).toBe('function');

        const events = await transport.fetchBackfill([{ kinds: [1059], since: 1 }]);
        expect(events).toEqual([]);
    });
});
