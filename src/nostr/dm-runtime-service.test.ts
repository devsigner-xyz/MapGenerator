import { describe, expect, test, vi } from 'vitest';
import { createRuntimeDirectMessagesService } from './dm-runtime-service';

const OWNER = 'a'.repeat(64);
const PEER = 'b'.repeat(64);

function createWriteGatewayMock() {
    return {
        publishEvent: vi.fn(),
        encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
        decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
    };
}

function createTransportMock() {
    return {
        publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
        subscribe: vi.fn(() => ({
            unsubscribe() {
                return;
            },
        })),
        fetchBackfill: vi.fn(async () => []),
    };
}

describe('dm-runtime-service', () => {
    test('forwards subscribeInbox using only ownerPubkey', () => {
        const subscribeInbox = vi.fn(() => () => {});
        const createDmService = vi.fn(() => ({
            subscribeInbox,
            sendDm: vi.fn(async () => null),
        }));

        const service = createRuntimeDirectMessagesService({
            writeGateway: createWriteGatewayMock() as any,
            createDmService,
            createTransport: () => createTransportMock() as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        service.subscribeInbox({ ownerPubkey: OWNER }, () => {});

        expect(subscribeInbox).toHaveBeenCalledWith({ ownerPubkey: OWNER }, expect.any(Function));
    });

    test('loadInitialConversations forwards sentIndex to global backfill', async () => {
        const fetchGlobalBackfill = vi.fn(async () => []);
        const createDmService = vi.fn(() => ({
            subscribeInbox: vi.fn(() => () => {}),
            sendDm: vi.fn(async () => null),
            fetchGlobalBackfill,
        }));
        const sentIndex = [
            {
                clientMessageId: 'client-1',
                conversationId: PEER,
                rumorEventId: 'r'.repeat(64),
                createdAtSec: 123,
                deliveryState: 'sent' as const,
                targetRelays: ['wss://relay.one'],
                plaintext: 'hola',
            },
        ];

        const service = createRuntimeDirectMessagesService({
            writeGateway: createWriteGatewayMock() as any,
            createDmService,
            createTransport: () => createTransportMock() as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        await service.loadInitialConversations({
            ownerPubkey: OWNER,
            sentIndex,
        });

        expect(fetchGlobalBackfill).toHaveBeenCalledWith({
            ownerPubkey: OWNER,
            mode: 'session_start',
            sentIndex,
        });
    });

    test('loadInitialConversations forwards reconnect mode when requested', async () => {
        const fetchGlobalBackfill = vi.fn(async () => []);
        const createDmService = vi.fn(() => ({
            subscribeInbox: vi.fn(() => () => {}),
            sendDm: vi.fn(async () => null),
            fetchGlobalBackfill,
        }));

        const service = createRuntimeDirectMessagesService({
            writeGateway: createWriteGatewayMock() as any,
            createDmService,
            createTransport: () => createTransportMock() as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        await service.loadInitialConversations({
            ownerPubkey: OWNER,
            mode: 'reconnect',
        } as any);

        expect(fetchGlobalBackfill).toHaveBeenCalledWith({
            ownerPubkey: OWNER,
            mode: 'reconnect',
            sentIndex: [],
        });
    });

    test('exposes conversation backfill loader and forwards owner/peer/since/sentIndex', async () => {
        const fetchConversationBackfill = vi.fn(async () => []);
        const createDmService = vi.fn(() => ({
            subscribeInbox: vi.fn(() => () => {}),
            sendDm: vi.fn(async () => null),
            fetchConversationBackfill,
        }));

        const service = createRuntimeDirectMessagesService({
            writeGateway: createWriteGatewayMock() as any,
            createDmService,
            createTransport: () => createTransportMock() as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        expect(typeof (service as any).loadConversationMessages).toBe('function');

        const sentIndex = [
            {
                clientMessageId: 'client-2',
                conversationId: PEER,
                rumorEventId: 's'.repeat(64),
                createdAtSec: 456,
                deliveryState: 'sent' as const,
                targetRelays: ['wss://relay.one'],
                plaintext: 'hello',
            },
        ];

        await (service as any).loadConversationMessages({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            since: 321,
            sentIndex,
        });

        expect(fetchConversationBackfill).toHaveBeenCalledWith({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            mode: 'session_start',
            since: 321,
            sentIndex,
        });
    });

    test('loadConversationMessages forwards reconnect mode when requested', async () => {
        const fetchConversationBackfill = vi.fn(async () => []);
        const createDmService = vi.fn(() => ({
            subscribeInbox: vi.fn(() => () => {}),
            sendDm: vi.fn(async () => null),
            fetchConversationBackfill,
        }));

        const service = createRuntimeDirectMessagesService({
            writeGateway: createWriteGatewayMock() as any,
            createDmService,
            createTransport: () => createTransportMock() as any,
            resolveRelays: () => ['wss://relay.one'],
        });

        await (service as any).loadConversationMessages({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            mode: 'reconnect',
        });

        expect(fetchConversationBackfill).toHaveBeenCalledWith({
            ownerPubkey: OWNER,
            peerPubkey: PEER,
            mode: 'reconnect',
            since: undefined,
            sentIndex: [],
        });
    });
});
