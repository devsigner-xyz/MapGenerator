import { describe, expect, test, vi } from 'vitest';
import type { NostrEvent } from './types';
import { createRuntimeSocialNotificationsService } from './social-notifications-runtime-service';
import { createTransportPool } from './transport-pool';

function notificationEvent(id: string, createdAt: number, kind = 1): NostrEvent {
    return {
        id,
        pubkey: 'a'.repeat(64),
        kind,
        created_at: createdAt,
        tags: [['p', 'b'.repeat(64)]],
        content: 'note',
    };
}

describe('social-notifications-runtime-service', () => {
    test('reuses a single transport for initial load and subscription with the same relay set', async () => {
        const subscribeCleanup = vi.fn();
        const transport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({
                unsubscribe: subscribeCleanup,
            })),
            fetchBackfill: vi.fn(async () => [notificationEvent('event-1', 100)]),
        };
        const createTransport = vi.fn(() => transport as any);

        const service = createRuntimeSocialNotificationsService({
            createTransport,
            resolveRelays: () => ['wss://relay.one'],
            transportPool: createTransportPool(),
        });

        await service.loadInitialSocial({ ownerPubkey: 'b'.repeat(64), limit: 20 });
        const unsubscribe = service.subscribeSocial({ ownerPubkey: 'b'.repeat(64) }, () => {
            return;
        });
        unsubscribe();

        expect(createTransport).toHaveBeenCalledTimes(1);
        expect(subscribeCleanup).toHaveBeenCalledTimes(1);
    });

    test('falls back to secondary relays when primary load fails', async () => {
        const primaryTransport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({ unsubscribe() { return; } })),
            fetchBackfill: vi.fn(async () => {
                throw new Error('relay timeout');
            }),
        };
        const fallbackTransport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({ unsubscribe() { return; } })),
            fetchBackfill: vi.fn(async () => [notificationEvent('event-fallback', 123)]),
        };

        const createTransport = vi.fn((relays: string[]) => {
            if (relays.includes('wss://primary.relay')) {
                return primaryTransport as any;
            }

            return fallbackTransport as any;
        });

        const service = createRuntimeSocialNotificationsService({
            createTransport,
            resolveRelays: () => ['wss://primary.relay'],
            resolveFallbackRelays: () => ['wss://fallback.relay'],
            transportPool: createTransportPool(),
        });

        const events = await service.loadInitialSocial({ ownerPubkey: 'c'.repeat(64), limit: 20 });

        expect(events.map((event) => event.id)).toEqual(['event-fallback']);
        expect(createTransport).toHaveBeenCalledTimes(2);
    });

    test('accepts kind 16 repost notifications in backfill and subscription filters', async () => {
        const subscribe = vi.fn(() => ({ unsubscribe() { return; } }));
        const transport = {
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe,
            fetchBackfill: vi.fn(async () => [notificationEvent('event-16', 150, 16)]),
        };

        const service = createRuntimeSocialNotificationsService({
            createTransport: vi.fn(() => transport as any),
            resolveRelays: () => ['wss://relay.one'],
            transportPool: createTransportPool(),
        });

        const events = await service.loadInitialSocial({ ownerPubkey: 'b'.repeat(64), limit: 20 });
        const unsubscribe = service.subscribeSocial({ ownerPubkey: 'b'.repeat(64) }, () => {
            return;
        });
        unsubscribe();

        expect(events).toEqual([notificationEvent('event-16', 150, 16)]);
        expect(subscribe).toHaveBeenCalledWith(
            [expect.objectContaining({ kinds: expect.arrayContaining([1, 6, 7, 16, 9735]) })],
            expect.any(Function),
        );
    });
});
