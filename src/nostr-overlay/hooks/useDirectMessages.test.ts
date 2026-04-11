import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
    DM_SENT_INDEX_MAX_ITEMS,
    DM_SENT_INDEX_MAX_AGE_SECONDS,
    buildSeenStorageKey,
    buildSentIndexStorageKey,
    createDirectMessagesStore,
    createDmReadStateStorage,
} from './useDirectMessages';

const OWNER_A = 'a'.repeat(64);
const OWNER_B = 'b'.repeat(64);
const PEER = 'c'.repeat(64);

beforeEach(() => {
    window.localStorage.clear();
});

function createDmServiceMock() {
    return {
        subscribeInbox: vi.fn((_input, _onMessage) => () => {}),
        sendDm: vi.fn(async (input) => ({
            id: `msg:${input.clientMessageId}`,
            clientMessageId: input.clientMessageId,
            conversationId: input.peerPubkey,
            peerPubkey: input.peerPubkey,
            direction: 'outgoing' as const,
            createdAt: 100,
            plaintext: input.plaintext,
            deliveryState: 'sent' as const,
            publishResult: {
                ackedRelays: ['wss://relay.one'],
                failedRelays: [],
                timeoutRelays: [],
            },
            attempts: 1,
            rumorEventId: 'r'.repeat(64),
        })),
    };
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

describe('useDirectMessages storage and keys', () => {
    test('uses key format nostr-overlay:dm:v1:seen:<ownerPubkey>:<conversationId>', () => {
        expect(buildSeenStorageKey(OWNER_A, PEER, 'v1')).toBe(`nostr-overlay:dm:v1:seen:${OWNER_A}:${PEER}`);
    });

    test('isolates seen-state storage per user', () => {
        const storage = createDmReadStateStorage({
            storage: window.localStorage,
            now: () => 1_000,
            version: 'v1',
        });

        storage.setLastReadAt(OWNER_A, PEER, 120);
        storage.setLastReadAt(OWNER_B, PEER, 150);

        expect(storage.getLastReadAt(OWNER_A, PEER)).toBe(120);
        expect(storage.getLastReadAt(OWNER_B, PEER)).toBe(150);
    });

    test('migrates seen-state best effort from v1 to v2', () => {
        const v1Key = buildSeenStorageKey(OWNER_A, PEER, 'v1');
        const v2Key = buildSeenStorageKey(OWNER_A, PEER, 'v2');
        window.localStorage.setItem(v1Key, JSON.stringify({ lastReadAt: 321 }));

        const storage = createDmReadStateStorage({
            storage: window.localStorage,
            now: () => 1_000,
            version: 'v2',
        });

        expect(storage.getLastReadAt(OWNER_A, PEER)).toBe(321);
        expect(window.localStorage.getItem(v2Key)).toBe(JSON.stringify({ lastReadAt: 321 }));
        expect(window.localStorage.getItem(v1Key)).toBeNull();
    });

    test('applies sent-index schema and GC limits (30 days, max 2000)', () => {
        const nowSec = 3_000_000;
        const storage = createDmReadStateStorage({
            storage: window.localStorage,
            now: () => nowSec,
            version: 'v1',
        });

        const total = DM_SENT_INDEX_MAX_ITEMS + 250;
        const staleTimestamp = nowSec - DM_SENT_INDEX_MAX_AGE_SECONDS - 10;
        const freshTimestamp = nowSec - 60;
        const items = Array.from({ length: total }, (_, index) => ({
            clientMessageId: `client-${index}`,
            conversationId: PEER,
            rumorEventId: `r${index}`,
            createdAtSec: index < 80 ? staleTimestamp : freshTimestamp,
            deliveryState: 'sent' as const,
            targetRelays: ['wss://relay.one'],
        }));

        storage.setSentIndex(OWNER_A, items);
        const stored = storage.getSentIndex(OWNER_A);

        expect(stored.length).toBe(DM_SENT_INDEX_MAX_ITEMS);
        expect(stored.every((item) => item.createdAtSec >= nowSec - DM_SENT_INDEX_MAX_AGE_SECONDS)).toBe(true);
        expect(buildSentIndexStorageKey(OWNER_A, 'v1')).toBe(`nostr-overlay:dm:v1:sent-index:${OWNER_A}`);
    });
});

describe('useDirectMessages store behavior', () => {
    test('start hydrates conversations from initial backfill before live inbox events', async () => {
        const dmService = {
            subscribeInbox: vi.fn((_input, _onMessage) => () => {}),
            loadInitialConversations: vi.fn(async () => [
                {
                    id: 'bootstrap-1',
                    clientMessageId: '',
                    conversationId: PEER,
                    peerPubkey: PEER,
                    direction: 'incoming' as const,
                    createdAt: 1700000200,
                    plaintext: 'mensaje historico',
                    deliveryState: 'sent' as const,
                },
            ]),
        };
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });
        const store = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService: dmService as any, storage });

        await store.start();

        expect(dmService.loadInitialConversations).toHaveBeenCalledWith({ ownerPubkey: OWNER_A, sentIndex: [] });
        expect(dmService.subscribeInbox).toHaveBeenCalledTimes(1);
        expect(store.getState().conversations[PEER]?.messages).toEqual([
            expect.objectContaining({
                id: 'bootstrap-1',
                plaintext: 'mensaje historico',
            }),
        ]);

        store.dispose();
    });

    test('does not duplicate messages when bootstrap and live stream contain same id', async () => {
        let liveListener: ((message: any) => void) | null = null;
        const dmService = {
            subscribeInbox: vi.fn((_input, onMessage) => {
                liveListener = onMessage;
                return () => {};
            }),
            loadInitialConversations: vi.fn(async () => [
                {
                    id: 'same-id',
                    clientMessageId: '',
                    conversationId: PEER,
                    peerPubkey: PEER,
                    direction: 'incoming' as const,
                    createdAt: 1700000300,
                    plaintext: 'bootstrap',
                    deliveryState: 'sent' as const,
                },
            ]),
        };
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });
        const store = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService: dmService as any, storage });

        await store.start();
        liveListener?.({
            id: 'same-id',
            clientMessageId: '',
            conversationId: PEER,
            peerPubkey: PEER,
            direction: 'incoming' as const,
            createdAt: 1700000300999,
            plaintext: 'live duplicate',
            deliveryState: 'sent' as const,
        });

        expect(store.getState().conversations[PEER]?.messages).toHaveLength(1);

        store.dispose();
    });

    test('computes unread correctly after bootstrap ingest', async () => {
        let liveListener: ((message: any) => void) | null = null;
        const dmService = {
            subscribeInbox: vi.fn((_input, onMessage) => {
                liveListener = onMessage;
                return () => {};
            }),
            loadInitialConversations: vi.fn(async () => [
                {
                    id: 'bootstrap-read',
                    clientMessageId: '',
                    conversationId: PEER,
                    peerPubkey: PEER,
                    direction: 'incoming' as const,
                    createdAt: 1700000000,
                    plaintext: 'old bootstrap',
                    deliveryState: 'sent' as const,
                },
            ]),
        };
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });
        storage.setLastReadAt(OWNER_A, PEER, 1700000000);
        const store = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService: dmService as any, storage });

        await store.start();
        liveListener?.({
            id: 'live-new',
            clientMessageId: '',
            conversationId: PEER,
            peerPubkey: PEER,
            direction: 'incoming' as const,
            createdAt: 1700000500123,
            plaintext: 'new live',
            deliveryState: 'sent' as const,
        });

        expect(store.getState().conversations[PEER]?.hasUnread).toBe(true);
        expect(store.getState().hasUnreadGlobal).toBe(true);
        expect(store.getState().conversations[PEER]?.messages.map((message) => message.createdAt)).toEqual([
            1700000000,
            1700000500,
        ]);

        store.dispose();
    });

    test('keeps singleton inbox subscription per ownerPubkey', async () => {
        const dmService = createDmServiceMock();
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });

        const first = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService, storage });
        const second = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService, storage });

        await first.start();
        await second.start();

        expect(dmService.subscribeInbox).toHaveBeenCalledTimes(1);

        second.dispose();
        first.dispose();
    });

    test('reconnect cycle cleans previous subscription before resubscribing same owner', async () => {
        const dmService = createDmServiceMock();
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });

        const store = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService, storage });
        await store.start();
        store.dispose();
        await store.start();

        expect(dmService.subscribeInbox).toHaveBeenCalledTimes(2);

        store.dispose();
    });

    test('tracks unread globally and marks undecryptable incoming messages as read when opening conversation', () => {
        const dmService = createDmServiceMock();
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });
        const store = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService, storage });

        store.ingestIncoming({
            id: 'msg-1',
            clientMessageId: '',
            conversationId: PEER,
            peerPubkey: PEER,
            direction: 'incoming',
            createdAt: 1700000000,
            plaintext: '[No se pudo desencriptar este mensaje]',
            deliveryState: 'sent',
            isUndecryptable: true,
        });

        expect(store.getState().hasUnreadGlobal).toBe(true);
        expect(store.getState().conversations[PEER]?.hasUnread).toBe(true);

        store.openConversation(PEER);

        expect(store.getState().conversations[PEER]?.hasUnread).toBe(false);
        expect(store.getState().hasUnreadGlobal).toBe(false);
    });

    test('stores lastReadAt in epoch seconds', () => {
        const dmService = createDmServiceMock();
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });
        const store = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService, storage });

        store.ingestIncoming({
            id: 'msg-2',
            clientMessageId: '',
            conversationId: PEER,
            peerPubkey: PEER,
            direction: 'incoming',
            createdAt: 1_700_000_123_456,
            plaintext: 'hola',
            deliveryState: 'sent',
        });

        store.markConversationRead(PEER);

        const state = store.getState();
        expect(state.conversations[PEER]?.lastReadAt).toBe(1_700_000_123);
    });

    test('openConversation triggers conversation backfill and ingests returned messages', async () => {
        const dmService = {
            subscribeInbox: vi.fn((_input, _onMessage) => () => {}),
            loadConversationMessages: vi.fn(async () => [
                {
                    id: 'conv-backfill-1',
                    clientMessageId: '',
                    conversationId: PEER,
                    peerPubkey: PEER,
                    direction: 'incoming' as const,
                    createdAt: 1700000700,
                    plaintext: 'backfill abierto',
                    deliveryState: 'sent' as const,
                },
            ]),
        };
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });
        const store = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService: dmService as any, storage });

        await store.start();
        store.openConversation(PEER);
        await Promise.resolve();
        await Promise.resolve();

        expect(dmService.loadConversationMessages).toHaveBeenCalledWith({
            ownerPubkey: OWNER_A,
            peerPubkey: PEER,
            since: 0,
            sentIndex: [],
        });
        expect(store.getState().conversations[PEER]?.messages).toEqual([
            expect.objectContaining({
                id: 'conv-backfill-1',
                plaintext: 'backfill abierto',
            }),
        ]);

        store.dispose();
    });

    test('openConversation uses oldest message cursor for incremental backfill', async () => {
        const dmService = {
            subscribeInbox: vi.fn((_input, _onMessage) => () => {}),
            loadConversationMessages: vi.fn(async () => []),
        };
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });
        const store = createDirectMessagesStore({ ownerPubkey: OWNER_A, dmService: dmService as any, storage });

        store.ingestIncoming({
            id: 'existing-msg',
            clientMessageId: '',
            conversationId: PEER,
            peerPubkey: PEER,
            direction: 'incoming',
            createdAt: 1700000900,
            plaintext: 'existente',
            deliveryState: 'sent',
        });

        store.openConversation(PEER);
        await Promise.resolve();
        await Promise.resolve();

        expect(dmService.loadConversationMessages).toHaveBeenCalledWith(
            expect.objectContaining({
                ownerPubkey: OWNER_A,
                peerPubkey: PEER,
                since: 1700000899,
            })
        );
    });

    test('start does not block forever when initial backfill is slow and still hydrates when it completes later', async () => {
        const deferred = createDeferred<any[]>();
        const dmService = {
            subscribeInbox: vi.fn((_input, _onMessage) => () => {}),
            loadInitialConversations: vi.fn(async () => deferred.promise),
        };
        const storage = createDmReadStateStorage({ storage: window.localStorage, now: () => 1_000, version: 'v1' });
        const store = createDirectMessagesStore({
            ownerPubkey: OWNER_A,
            dmService: dmService as any,
            storage,
            bootstrapWaitTimeoutMs: 1,
        });

        await store.start();

        expect(dmService.subscribeInbox).toHaveBeenCalledTimes(1);
        expect(store.getState().isBootstrapping).toBe(false);

        deferred.resolve([
            {
                id: 'late-bootstrap',
                clientMessageId: '',
                conversationId: PEER,
                peerPubkey: PEER,
                direction: 'incoming' as const,
                createdAt: 1700001200,
                plaintext: 'llega tarde',
                deliveryState: 'sent' as const,
            },
        ]);

        await Promise.resolve();
        await Promise.resolve();

        expect(store.getState().conversations[PEER]?.messages).toEqual([
            expect.objectContaining({
                id: 'late-bootstrap',
                plaintext: 'llega tarde',
            }),
        ]);

        store.dispose();
    });
});
