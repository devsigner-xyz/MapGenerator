import { describe, expect, test, vi } from 'vitest';
import { createDmService, type DmMessage } from './dm-service';
import { resolveRelayTargetsByTier } from './dm-transport-ndk';
import type { NostrEvent, NostrFilter } from './types';

const OWNER = 'a'.repeat(64);
const PEER = 'b'.repeat(64);

function event(overrides: Partial<NostrEvent>): NostrEvent {
    return {
        id: '1'.repeat(64),
        pubkey: PEER,
        kind: 1,
        created_at: 100,
        tags: [],
        content: '',
        sig: 'f'.repeat(128),
        ...overrides,
    };
}

function createWriteGatewayMock() {
    return {
        decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
        publishEvent: vi.fn(async (unsignedEvent: Omit<NostrEvent, 'id' | 'pubkey'>) => {
            const id = `${unsignedEvent.kind}`.padStart(64, '0').slice(0, 64);
            return {
                ...unsignedEvent,
                id,
                pubkey: OWNER,
                sig: 'e'.repeat(128),
            };
        }),
    };
}

function createTransportMock() {
    return {
        publishToRelays: vi.fn(async (_event: NostrEvent, _relayUrls: string[]) => ({
            ackedRelays: ['wss://relay.session'],
            failedRelays: [],
            timeoutRelays: [],
        })),
        subscribe: vi.fn(() => ({
            unsubscribe() {
                return;
            },
        })),
        fetchBackfill: vi.fn<(filters: NostrFilter[]) => Promise<NostrEvent[]>>(async (_filters) => []),
    };
}

function buildWrappedDmEvent(input: {
    giftWrapId: string;
    sealId: string;
    rumorId: string;
    giftWrapPubkey: string;
    sealPubkey: string;
    rumorPubkey: string;
    rumorRecipient: string;
    rumorContent: string;
    rumorCreatedAt: number;
    giftWrapRecipient?: string;
}): NostrEvent {
    const rumor = event({
        id: input.rumorId,
        kind: 14,
        pubkey: input.rumorPubkey,
        created_at: input.rumorCreatedAt,
        tags: [['p', input.rumorRecipient]],
        content: input.rumorContent,
    });

    const seal = event({
        id: input.sealId,
        kind: 13,
        pubkey: input.sealPubkey,
        content: JSON.stringify(rumor),
    });

    return event({
        id: input.giftWrapId,
        kind: 1059,
        pubkey: input.giftWrapPubkey,
        tags: [['p', input.giftWrapRecipient ?? OWNER]],
        content: JSON.stringify(seal),
    });
}

function buildLegacyKind4Event(input: {
    eventId: string;
    authorPubkey: string;
    recipientPubkey: string;
    ciphertext: string;
    createdAt: number;
}): NostrEvent {
    return event({
        id: input.eventId,
        kind: 4,
        pubkey: input.authorPubkey,
        created_at: input.createdAt,
        tags: [['p', input.recipientPubkey]],
        content: input.ciphertext,
    });
}

describe('dm-service parsing and validation', () => {
    test('unwraps layers in order 1059 -> 13 -> 14', async () => {
        const rumor = event({
            id: 'r'.repeat(64),
            kind: 14,
            pubkey: PEER,
            created_at: 11,
            tags: [['p', OWNER]],
            content: 'hola',
        });
        const seal = event({
            id: 's'.repeat(64),
            kind: 13,
            pubkey: PEER,
            content: JSON.stringify(rumor),
        });
        const giftWrap = event({
            id: 'g'.repeat(64),
            kind: 1059,
            pubkey: 'c'.repeat(64),
            tags: [['p', OWNER]],
            content: JSON.stringify(seal),
        });

        const writeGateway = createWriteGatewayMock();
        const service = createDmService({
            transport: createTransportMock(),
            writeGateway,
            verifyEvent: () => true,
            now: () => 100,
            wait: async () => {},
        });

        const parsed = await service.parseGiftWrapEvent(giftWrap, {
            ownerPubkey: OWNER,
            peerPubkey: PEER,
        });

        expect(parsed).toMatchObject({
            rumorEventId: rumor.id,
            sealEventId: seal.id,
            giftWrapEventId: giftWrap.id,
            direction: 'incoming',
            plaintext: 'hola',
        });
    });

    test('validates signatures for gift wrap and seal', async () => {
        const rumor = event({ kind: 14, pubkey: PEER, tags: [['p', OWNER]], content: 'x' });
        const seal = event({ kind: 13, pubkey: PEER, content: JSON.stringify(rumor) });
        const giftWrap = event({ kind: 1059, pubkey: 'c'.repeat(64), tags: [['p', OWNER]], content: JSON.stringify(seal) });

        const writeGateway = createWriteGatewayMock();
        const verifyGiftWrapFails = createDmService({
            transport: createTransportMock(),
            writeGateway,
            verifyEvent: (current) => current.kind !== 1059,
            now: () => 100,
            wait: async () => {},
        });

        const verifySealFails = createDmService({
            transport: createTransportMock(),
            writeGateway,
            verifyEvent: (current) => current.kind !== 13,
            now: () => 100,
            wait: async () => {},
        });

        await expect(
            verifyGiftWrapFails.parseGiftWrapEvent(giftWrap, {
                ownerPubkey: OWNER,
                peerPubkey: PEER,
            })
        ).resolves.toBeNull();

        await expect(
            verifySealFails.parseGiftWrapEvent(giftWrap, {
                ownerPubkey: OWNER,
                peerPubkey: PEER,
            })
        ).resolves.toBeNull();
    });

    test('rejects when seal pubkey does not match rumor pubkey', async () => {
        const rumor = event({ kind: 14, pubkey: PEER, tags: [['p', OWNER]], content: 'x' });
        const seal = event({ kind: 13, pubkey: OWNER, content: JSON.stringify(rumor) });
        const giftWrap = event({ kind: 1059, tags: [['p', OWNER]], content: JSON.stringify(seal) });

        const service = createDmService({
            transport: createTransportMock(),
            writeGateway: createWriteGatewayMock(),
            verifyEvent: () => true,
            now: () => 100,
            wait: async () => {},
        });

        await expect(service.parseGiftWrapEvent(giftWrap, { ownerPubkey: OWNER, peerPubkey: PEER })).resolves.toBeNull();
    });

    test('accepts only rumor kind 14 with exactly one p tag', async () => {
        const baseRumor = event({ kind: 14, pubkey: PEER, content: 'x' });

        const service = createDmService({
            transport: createTransportMock(),
            writeGateway: createWriteGatewayMock(),
            verifyEvent: () => true,
            now: () => 100,
            wait: async () => {},
        });

        const invalidRumors = [
            event({ ...baseRumor, tags: [] }),
            event({ ...baseRumor, tags: [['p', OWNER], ['p', 'd'.repeat(64)]] }),
        ];

        for (const rumor of invalidRumors) {
            const seal = event({ kind: 13, pubkey: PEER, content: JSON.stringify(rumor) });
            const wrap = event({ kind: 1059, tags: [['p', OWNER]], content: JSON.stringify(seal) });

            await expect(service.parseGiftWrapEvent(wrap, { ownerPubkey: OWNER, peerPubkey: PEER })).resolves.toBeNull();
        }
    });

    test('applies explicit incoming/outgoing directional matrix and rejects invalid routes', async () => {
        const service = createDmService({
            transport: createTransportMock(),
            writeGateway: createWriteGatewayMock(),
            verifyEvent: () => true,
            now: () => 100,
            wait: async () => {},
        });

        const incomingRumor = event({ kind: 14, pubkey: PEER, tags: [['p', OWNER]], content: 'incoming' });
        const outgoingRumor = event({ kind: 14, pubkey: OWNER, tags: [['p', PEER]], content: 'outgoing' });
        const invalidRumor = event({ kind: 14, pubkey: PEER, tags: [['p', 'c'.repeat(64)]], content: 'invalid' });

        const incoming = await service.parseGiftWrapEvent(
            event({ kind: 1059, tags: [['p', OWNER]], content: JSON.stringify(event({ kind: 13, pubkey: PEER, content: JSON.stringify(incomingRumor) })) }),
            { ownerPubkey: OWNER, peerPubkey: PEER }
        );

        const outgoing = await service.parseGiftWrapEvent(
            event({ kind: 1059, tags: [['p', OWNER]], content: JSON.stringify(event({ kind: 13, pubkey: OWNER, content: JSON.stringify(outgoingRumor) })) }),
            { ownerPubkey: OWNER, peerPubkey: PEER }
        );

        const invalid = await service.parseGiftWrapEvent(
            event({ kind: 1059, tags: [['p', OWNER]], content: JSON.stringify(event({ kind: 13, pubkey: PEER, content: JSON.stringify(invalidRumor) })) }),
            { ownerPubkey: OWNER, peerPubkey: PEER }
        );

        expect(incoming?.direction).toBe('incoming');
        expect(outgoing?.direction).toBe('outgoing');
        expect(invalid).toBeNull();
    });

    test('orders by rumor created_at and dedupes by rumorEventId', () => {
        const service = createDmService({
            transport: createTransportMock(),
            writeGateway: createWriteGatewayMock(),
            verifyEvent: () => true,
            now: () => 100,
            wait: async () => {},
        });

        const merged = service.mergeConversationMessages([], [
            {
                id: 'm2',
                clientMessageId: 'c2',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 20,
                plaintext: 'b',
                rumorEventId: 'x'.repeat(64),
                sealEventId: 's2',
                giftWrapEventId: 'g2',
                deliveryState: 'sent',
            },
            {
                id: 'm1',
                clientMessageId: 'c1',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 10,
                plaintext: 'a',
                rumorEventId: 'y'.repeat(64),
                sealEventId: 's1',
                giftWrapEventId: 'g1',
                deliveryState: 'sent',
            },
            {
                id: 'm2-dup',
                clientMessageId: 'c2-dup',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 30,
                plaintext: 'dup',
                rumorEventId: 'x'.repeat(64),
                sealEventId: 's3',
                giftWrapEventId: 'g3',
                deliveryState: 'sent',
            },
        ]);

        expect(merged.map((item) => item.id)).toEqual(['m1', 'm2']);
    });

    test('uses dedupe fallback and lexical tie-break for same timestamp', () => {
        const service = createDmService({
            transport: createTransportMock(),
            writeGateway: createWriteGatewayMock(),
            verifyEvent: () => true,
            now: () => 100,
            wait: async () => {},
        });

        const messages: DmMessage[] = [
            {
                id: 'first',
                clientMessageId: 'c1',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 10,
                plaintext: 'same-seal',
                sealEventId: 'seal-1',
                giftWrapEventId: 'g1',
                deliveryState: 'sent',
            },
            {
                id: 'second',
                clientMessageId: 'c2',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 11,
                plaintext: 'same-seal-duplicate',
                sealEventId: 'seal-1',
                giftWrapEventId: 'g2',
                deliveryState: 'sent',
            },
            {
                id: 'third',
                clientMessageId: 'c3',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 12,
                plaintext: 'same-content',
                giftWrapEventId: 'g3',
                deliveryState: 'sent',
            },
            {
                id: 'fourth',
                clientMessageId: 'c4',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 13,
                plaintext: 'same-content',
                giftWrapEventId: 'g4',
                deliveryState: 'sent',
            },
            {
                id: 'lex-b',
                clientMessageId: 'c5',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 20,
                plaintext: 'x',
                rumorEventId: 'b'.repeat(64),
                giftWrapEventId: 'g5',
                deliveryState: 'sent',
            },
            {
                id: 'lex-a',
                clientMessageId: 'c6',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming',
                createdAt: 20,
                plaintext: 'y',
                rumorEventId: 'a'.repeat(64),
                giftWrapEventId: 'g6',
                deliveryState: 'sent',
            },
        ];

        const merged = service.mergeConversationMessages([], messages);
        expect(merged.map((item) => item.id)).toEqual(['first', 'third', 'lex-a', 'lex-b']);
    });

    test('drops malformed layered payloads without mutating store callback', async () => {
        const onMessage = vi.fn();
        const writeGateway = createWriteGatewayMock();
        writeGateway.decryptDm.mockResolvedValueOnce('{not-json');

        const service = createDmService({
            transport: createTransportMock(),
            writeGateway,
            verifyEvent: () => true,
            now: () => 100,
            wait: async () => {},
        });

        await service.consumeGiftWrapEvent(
            event({ kind: 1059, tags: [['p', OWNER]], content: 'ciphertext' }),
            { ownerPubkey: OWNER, peerPubkey: PEER },
            onMessage
        );

        expect(onMessage).not.toHaveBeenCalled();
    });
});

describe('dm-service send, retries and tags', () => {
    test('reuses clientMessageId and rumorEventId across retries', async () => {
        const transport = createTransportMock();
        transport.publishToRelays
            .mockResolvedValueOnce({ ackedRelays: [], failedRelays: [{ relay: 'wss://relay.session', reason: 'reject' }], timeoutRelays: [] })
            .mockResolvedValueOnce({ ackedRelays: [], failedRelays: [], timeoutRelays: ['wss://relay.session'] })
            .mockResolvedValueOnce({ ackedRelays: ['wss://relay.session'], failedRelays: [], timeoutRelays: [] });

        const wait = vi.fn(async () => {});
        const service = createDmService({
            transport,
            writeGateway: createWriteGatewayMock(),
            verifyEvent: () => true,
            now: () => 100,
            wait,
        });

        const relaySelection = resolveRelayTargetsByTier({
            inboxWrite: [],
            read: [],
            session: ['wss://relay.session'],
        });

        const result = await service.sendDm({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            plaintext: 'hello',
            clientMessageId: 'client-1',
            relaySelection,
            targetRelays: relaySelection.relays,
        });

        expect(result.clientMessageId).toBe('client-1');
        expect(result.deliveryState).toBe('sent');
        expect(transport.publishToRelays).toHaveBeenCalledTimes(3);

        const firstAttemptEvent = transport.publishToRelays.mock.calls[0][0] as NostrEvent;
        const secondAttemptEvent = transport.publishToRelays.mock.calls[1][0] as NostrEvent;
        const thirdAttemptEvent = transport.publishToRelays.mock.calls[2][0] as NostrEvent;
        expect(firstAttemptEvent.id).toBe(secondAttemptEvent.id);
        expect(secondAttemptEvent.id).toBe(thirdAttemptEvent.id);
        expect(wait).toHaveBeenCalledWith(500);
        expect(wait).toHaveBeenCalledWith(1500);
    });

    test('builds required p tags for rumor kind 14 and gift wrap kind 1059', async () => {
        const writeGateway = createWriteGatewayMock();
        const service = createDmService({
            transport: createTransportMock(),
            writeGateway,
            verifyEvent: () => true,
            now: () => 100,
            wait: async () => {},
        });

        const relaySelection = resolveRelayTargetsByTier({
            inboxWrite: ['wss://relay.inbox'],
            read: [],
            session: [],
        });

        await service.sendDm({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            plaintext: 'hi',
            clientMessageId: 'client-2',
            relaySelection,
            targetRelays: relaySelection.relays,
        });

        const [rumorUnsigned, sealUnsigned, giftWrapUnsigned] = writeGateway.publishEvent.mock.calls.map((call) => call[0]);

        expect(rumorUnsigned.kind).toBe(14);
        expect(rumorUnsigned.tags).toEqual([['p', PEER]]);
        expect(sealUnsigned.kind).toBe(13);
        expect(giftWrapUnsigned.kind).toBe(1059);
        expect(giftWrapUnsigned.tags).toEqual([['p', PEER]]);
    });
});

describe('dm-service backfill strategy A/B/C', () => {
    test('uses 7d backfill window on session start', () => {
        const service = createDmService({
            transport: createTransportMock(),
            writeGateway: createWriteGatewayMock(),
            now: () => 2_000_000,
            wait: async () => {},
        });

        expect(service.resolveBackfillSince('session_start')).toBe(2_000_000 - (7 * 24 * 60 * 60));
    });

    test('uses 15m backfill window on reconnect', () => {
        const service = createDmService({
            transport: createTransportMock(),
            writeGateway: createWriteGatewayMock(),
            now: () => 2_000_000,
            wait: async () => {},
        });

        expect(service.resolveBackfillSince('reconnect')).toBe(2_000_000 - (15 * 60));
    });

    test('merges A/B/C sources canonically (inbox + relay outgoing + local sent-index)', async () => {
        const transport = createTransportMock();

        const inboxIncoming = buildWrappedDmEvent({
            giftWrapId: 'a'.repeat(64),
            sealId: '1'.repeat(64),
            rumorId: '2'.repeat(64),
            giftWrapPubkey: 'c'.repeat(64),
            sealPubkey: PEER,
            rumorPubkey: PEER,
            rumorRecipient: OWNER,
            rumorContent: 'incoming A',
            rumorCreatedAt: 100,
            giftWrapRecipient: OWNER,
        });

        const relayOutgoing = buildWrappedDmEvent({
            giftWrapId: 'b'.repeat(64),
            sealId: '3'.repeat(64),
            rumorId: '4'.repeat(64),
            giftWrapPubkey: 'd'.repeat(64),
            sealPubkey: OWNER,
            rumorPubkey: OWNER,
            rumorRecipient: PEER,
            rumorContent: 'outgoing B',
            rumorCreatedAt: 200,
            giftWrapRecipient: PEER,
        });

        transport.fetchBackfill
            .mockResolvedValueOnce([inboxIncoming])
            .mockResolvedValueOnce([relayOutgoing]);

        const service = createDmService({
            transport,
            writeGateway: createWriteGatewayMock(),
            now: () => 1_000,
            wait: async () => {},
            verifyEvent: () => true,
        });

        const merged = await service.fetchConversationBackfill({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            mode: 'session_start',
            sentIndex: [
                {
                    clientMessageId: 'local-1',
                    conversationId: PEER,
                    rumorEventId: '5'.repeat(64),
                    createdAtSec: 150,
                    deliveryState: 'sent',
                    targetRelays: ['wss://relay.session'],
                    plaintext: 'local C',
                },
            ],
        });

        expect(transport.fetchBackfill).toHaveBeenCalledTimes(2);
        expect(merged.map((message) => message.plaintext)).toEqual(['incoming A', 'local C', 'outgoing B']);
    });

    test('keeps only relay outgoing events that pass directional validation', async () => {
        const transport = createTransportMock();

        const validOutgoing = buildWrappedDmEvent({
            giftWrapId: 'c'.repeat(64),
            sealId: '6'.repeat(64),
            rumorId: '7'.repeat(64),
            giftWrapPubkey: 'e'.repeat(64),
            sealPubkey: OWNER,
            rumorPubkey: OWNER,
            rumorRecipient: PEER,
            rumorContent: 'valid outgoing',
            rumorCreatedAt: 210,
            giftWrapRecipient: PEER,
        });

        const invalidOutgoing = buildWrappedDmEvent({
            giftWrapId: 'd'.repeat(64),
            sealId: '8'.repeat(64),
            rumorId: '9'.repeat(64),
            giftWrapPubkey: 'f'.repeat(64),
            sealPubkey: PEER,
            rumorPubkey: PEER,
            rumorRecipient: OWNER,
            rumorContent: 'invalid outgoing',
            rumorCreatedAt: 220,
            giftWrapRecipient: PEER,
        });

        transport.fetchBackfill
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([validOutgoing, invalidOutgoing]);

        const service = createDmService({
            transport,
            writeGateway: createWriteGatewayMock(),
            now: () => 1_000,
            wait: async () => {},
            verifyEvent: () => true,
        });

        const merged = await service.fetchConversationBackfill({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            mode: 'reconnect',
            sentIndex: [],
        });

        expect(merged.map((message) => message.plaintext)).toEqual(['valid outgoing']);
    });

    test('uses reconnect backfill since for both inbox and relay outgoing queries', async () => {
        const transport = createTransportMock();
        transport.fetchBackfill
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const service = createDmService({
            transport,
            writeGateway: createWriteGatewayMock(),
            now: () => 1_000_000,
            wait: async () => {},
            verifyEvent: () => true,
        });

        await service.fetchConversationBackfill({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            mode: 'reconnect',
            sentIndex: [],
        });

        const firstFilter = transport.fetchBackfill.mock.calls[0][0][0];
        const secondFilter = transport.fetchBackfill.mock.calls[1][0][0];

        expect(firstFilter.since).toBe(1_000_000 - 900);
        expect(secondFilter.since).toBe(1_000_000 - 900);
        expect(firstFilter['#p']).toEqual([OWNER]);
        expect(secondFilter['#p']).toEqual([PEER]);
    });

    test('fetches historical messages across all peers from kind 1059 inbox + outgoing', async () => {
        const PEER_TWO = 'c'.repeat(64);
        const transport = createTransportMock();

        const inboxIncoming = buildWrappedDmEvent({
            giftWrapId: 'e'.repeat(64),
            sealId: 'a'.repeat(64),
            rumorId: 'b'.repeat(64),
            giftWrapPubkey: 'd'.repeat(64),
            sealPubkey: PEER,
            rumorPubkey: PEER,
            rumorRecipient: OWNER,
            rumorContent: 'inbox peer one',
            rumorCreatedAt: 100,
            giftWrapRecipient: OWNER,
        });

        const outgoingToSecondPeer = buildWrappedDmEvent({
            giftWrapId: 'f'.repeat(64),
            sealId: 'c'.repeat(64),
            rumorId: 'd'.repeat(64),
            giftWrapPubkey: 'e'.repeat(64),
            sealPubkey: OWNER,
            rumorPubkey: OWNER,
            rumorRecipient: PEER_TWO,
            rumorContent: 'outgoing peer two',
            rumorCreatedAt: 200,
            giftWrapRecipient: PEER_TWO,
        });

        transport.fetchBackfill
            .mockResolvedValueOnce([inboxIncoming])
            .mockResolvedValueOnce([outgoingToSecondPeer]);

        const service = createDmService({
            transport,
            writeGateway: createWriteGatewayMock(),
            now: () => 1_000,
            wait: async () => {},
            verifyEvent: () => true,
        });

        const merged = await service.fetchGlobalBackfill({
            ownerPubkey: OWNER,
            mode: 'session_start',
            sentIndex: [
                {
                    clientMessageId: 'local-1',
                    conversationId: PEER,
                    rumorEventId: '9'.repeat(64),
                    createdAtSec: 150,
                    deliveryState: 'sent',
                    targetRelays: ['wss://relay.session'],
                    plaintext: 'local peer one',
                },
            ],
        });

        expect(transport.fetchBackfill).toHaveBeenCalledTimes(2);
        expect(merged.map((message) => message.plaintext)).toEqual([
            'inbox peer one',
            'local peer one',
            'outgoing peer two',
        ]);
    });

    test('derives conversationId from event payload for each peer', async () => {
        const PEER_TWO = 'd'.repeat(64);
        const transport = createTransportMock();

        const incoming = buildWrappedDmEvent({
            giftWrapId: '1'.repeat(64),
            sealId: '2'.repeat(64),
            rumorId: '3'.repeat(64),
            giftWrapPubkey: '4'.repeat(64),
            sealPubkey: PEER,
            rumorPubkey: PEER,
            rumorRecipient: OWNER,
            rumorContent: 'incoming one',
            rumorCreatedAt: 100,
            giftWrapRecipient: OWNER,
        });

        const outgoing = buildWrappedDmEvent({
            giftWrapId: '5'.repeat(64),
            sealId: '6'.repeat(64),
            rumorId: '7'.repeat(64),
            giftWrapPubkey: '8'.repeat(64),
            sealPubkey: OWNER,
            rumorPubkey: OWNER,
            rumorRecipient: PEER_TWO,
            rumorContent: 'outgoing two',
            rumorCreatedAt: 120,
            giftWrapRecipient: PEER_TWO,
        });

        transport.fetchBackfill
            .mockResolvedValueOnce([incoming])
            .mockResolvedValueOnce([outgoing]);

        const service = createDmService({
            transport,
            writeGateway: createWriteGatewayMock(),
            now: () => 1_000,
            wait: async () => {},
            verifyEvent: () => true,
        });

        const merged = await service.fetchGlobalBackfill({
            ownerPubkey: OWNER,
            mode: 'session_start',
            sentIndex: [],
        });

        const byPlaintext = new Map(merged.map((message) => [message.plaintext, message.conversationId]));
        expect(byPlaintext.get('incoming one')).toBe(PEER);
        expect(byPlaintext.get('outgoing two')).toBe(PEER_TWO);
    });

    test('parses incoming/outgoing legacy kind4 messages into DmMessage shape', async () => {
        const PEER_TWO = 'e'.repeat(64);
        const transport = createTransportMock();

        const incoming = buildLegacyKind4Event({
            eventId: 'a'.repeat(64),
            authorPubkey: PEER,
            recipientPubkey: OWNER,
            ciphertext: 'nip04:incoming',
            createdAt: 100,
        });
        const outgoing = buildLegacyKind4Event({
            eventId: 'b'.repeat(64),
            authorPubkey: OWNER,
            recipientPubkey: PEER_TWO,
            ciphertext: 'nip04:outgoing',
            createdAt: 120,
        });

        transport.fetchBackfill
            .mockResolvedValueOnce([incoming])
            .mockResolvedValueOnce([outgoing]);

        const writeGateway = createWriteGatewayMock();
        writeGateway.decryptDm = vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext.replace('nip04:', ''));
        const service = createDmService({
            transport,
            writeGateway,
            now: () => 1_000,
            wait: async () => {},
            verifyEvent: () => true,
        });

        const merged = await service.fetchGlobalBackfill({
            ownerPubkey: OWNER,
            mode: 'session_start',
            sentIndex: [],
        });

        expect(merged.map((message) => ({
            conversationId: message.conversationId,
            direction: message.direction,
            plaintext: message.plaintext,
            eventId: message.eventId,
        }))).toEqual([
            {
                conversationId: PEER,
                direction: 'incoming',
                plaintext: 'incoming',
                eventId: 'a'.repeat(64),
            },
            {
                conversationId: PEER_TWO,
                direction: 'outgoing',
                plaintext: 'outgoing',
                eventId: 'b'.repeat(64),
            },
        ]);
    });

    test('uses nip04 decrypt path for kind4 events', async () => {
        const transport = createTransportMock();
        transport.fetchBackfill
            .mockResolvedValueOnce([
                buildLegacyKind4Event({
                    eventId: 'c'.repeat(64),
                    authorPubkey: PEER,
                    recipientPubkey: OWNER,
                    ciphertext: 'cipher-a',
                    createdAt: 100,
                }),
            ])
            .mockResolvedValueOnce([]);

        const writeGateway = createWriteGatewayMock();
        const service = createDmService({
            transport,
            writeGateway,
            now: () => 1_000,
            wait: async () => {},
            verifyEvent: () => true,
        });

        await service.fetchGlobalBackfill({
            ownerPubkey: OWNER,
            mode: 'session_start',
            sentIndex: [],
        });

        expect(writeGateway.decryptDm).toHaveBeenCalledWith(PEER, 'cipher-a', 'nip04');
    });

    test('keeps undecryptable legacy kind4 messages as placeholder entries', async () => {
        const transport = createTransportMock();
        transport.fetchBackfill
            .mockResolvedValueOnce([
                buildLegacyKind4Event({
                    eventId: 'd'.repeat(64),
                    authorPubkey: PEER,
                    recipientPubkey: OWNER,
                    ciphertext: 'bad-cipher',
                    createdAt: 100,
                }),
            ])
            .mockResolvedValueOnce([]);

        const writeGateway = createWriteGatewayMock();
        writeGateway.decryptDm = vi.fn(async () => {
            throw new Error('decrypt failed');
        });
        const service = createDmService({
            transport,
            writeGateway,
            now: () => 1_000,
            wait: async () => {},
            verifyEvent: () => true,
        });

        const merged = await service.fetchGlobalBackfill({
            ownerPubkey: OWNER,
            mode: 'session_start',
            sentIndex: [],
        });

        expect(merged).toEqual([
            expect.objectContaining({
                conversationId: PEER,
                direction: 'incoming',
                plaintext: '[No se pudo desencriptar este mensaje]',
                isUndecryptable: true,
                eventId: 'd'.repeat(64),
            }),
        ]);
    });
});
