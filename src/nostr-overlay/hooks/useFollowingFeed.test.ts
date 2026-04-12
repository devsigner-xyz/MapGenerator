import { describe, expect, test, vi } from 'vitest';
import {
    createFollowingFeedStore,
} from './useFollowingFeed';
import type { SocialEngagementByEventId, SocialFeedPage, SocialThreadPage } from '../../nostr/social-feed-service';

const OWNER = 'a'.repeat(64);
const FOLLOW_A = 'b'.repeat(64);
const FOLLOW_B = 'c'.repeat(64);

function createServiceMock(overrides: {
    loadFollowingFeed?: (args: { follows: string[]; limit?: number; until?: number }) => Promise<SocialFeedPage>;
    loadThread?: (args: { rootEventId: string; limit?: number; until?: number }) => Promise<SocialThreadPage>;
    loadEngagement?: (args: { eventIds: string[]; limit?: number; until?: number }) => Promise<SocialEngagementByEventId>;
} = {}) {
    return {
        loadFollowingFeed: vi.fn(overrides.loadFollowingFeed ?? (async () => ({ items: [], hasMore: false }))),
        loadThread: vi.fn(overrides.loadThread ?? (async () => ({ root: null, replies: [], hasMore: false }))),
        loadEngagement: vi.fn(overrides.loadEngagement ?? (async () => ({}))),
    };
}

function createWriteGatewayMock() {
    return {
        publishEvent: vi.fn(async () => ({
            id: 'published-event',
            pubkey: OWNER,
            kind: 7,
            created_at: 123,
            tags: [['e', 'target']],
            content: '+',
        })),
        publishTextNote: vi.fn(async (content: string, tags: string[][] = []) => ({
            id: 'published-note',
            pubkey: OWNER,
            kind: 1,
            created_at: 123,
            tags,
            content,
        })),
    };
}

describe('useFollowingFeed store', () => {
    test('openDialog loads first feed page', async () => {
        const service = createServiceMock({
            loadFollowingFeed: async () => ({
                items: [
                    {
                        id: 'note-1',
                        pubkey: FOLLOW_A,
                        createdAt: 100,
                        content: 'hola',
                        kind: 'note',
                        rawEvent: {
                            id: 'note-1',
                            pubkey: FOLLOW_A,
                            kind: 1,
                            created_at: 100,
                            tags: [],
                            content: 'hola',
                        },
                    },
                ],
                hasMore: false,
            }),
            loadEngagement: async () => ({
                'note-1': {
                    replies: 3,
                    reposts: 2,
                    reactions: 5,
                    zaps: 1,
                },
            }),
        });

        const store = createFollowingFeedStore({
            ownerPubkey: OWNER,
            follows: [FOLLOW_A, FOLLOW_B],
            canWrite: true,
            service,
            writeGateway: createWriteGatewayMock(),
        });

        await store.openDialog();

        const state = store.getState();
        expect(state.isDialogOpen).toBe(true);
        expect(state.items.map((item) => item.id)).toEqual(['note-1']);
        expect(state.engagementByEventId['note-1']).toEqual({
            replies: 3,
            reposts: 2,
            reactions: 5,
            zaps: 1,
        });
        expect(service.loadFollowingFeed).toHaveBeenCalledWith(expect.objectContaining({
            follows: [FOLLOW_A, FOLLOW_B],
        }));
        expect(service.loadEngagement).toHaveBeenCalledWith({ eventIds: ['note-1'] });
    });

    test('openThread and loadNextThreadPage merge paginated replies', async () => {
        const service = createServiceMock({
            loadThread: async (input) => {
                if (typeof input.until === 'number') {
                    return {
                        root: null,
                        replies: [
                            {
                                id: 'reply-b',
                                pubkey: FOLLOW_A,
                                createdAt: 430,
                                eventKind: 1,
                                content: 'reply b',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-b',
                                    pubkey: FOLLOW_A,
                                    kind: 1,
                                    created_at: 430,
                                    tags: [['e', 'root-1', '', 'reply']],
                                    content: 'reply b',
                                },
                            },
                        ],
                        hasMore: false,
                    };
                }

                return {
                    root: {
                        id: 'root-1',
                        pubkey: FOLLOW_B,
                        createdAt: 500,
                        eventKind: 1,
                        content: 'root',
                        rawEvent: {
                            id: 'root-1',
                            pubkey: FOLLOW_B,
                            kind: 1,
                            created_at: 500,
                            tags: [],
                            content: 'root',
                        },
                    },
                    replies: [
                        {
                            id: 'reply-a',
                            pubkey: FOLLOW_B,
                            createdAt: 450,
                            eventKind: 1,
                            content: 'reply a',
                            targetEventId: 'root-1',
                            rawEvent: {
                                id: 'reply-a',
                                pubkey: FOLLOW_B,
                                kind: 1,
                                created_at: 450,
                                tags: [['e', 'root-1', '', 'reply']],
                                content: 'reply a',
                            },
                        },
                    ],
                    hasMore: true,
                    nextUntil: 449,
                };
            },
            loadEngagement: async ({ eventIds }) => {
                const output: SocialEngagementByEventId = {};
                for (const eventId of eventIds) {
                    output[eventId] = {
                        replies: eventId === 'root-1' ? 1 : 0,
                        reposts: 0,
                        reactions: 0,
                        zaps: 0,
                    };
                }

                return output;
            },
        });

        const store = createFollowingFeedStore({
            ownerPubkey: OWNER,
            follows: [FOLLOW_A],
            canWrite: true,
            service,
            writeGateway: createWriteGatewayMock(),
        });

        await store.openThread('root-1');

        expect(store.getState().activeThread?.root?.id).toBe('root-1');
        expect(store.getState().activeThread?.replies.map((item) => item.id)).toEqual(['reply-a']);
        expect(store.getState().engagementByEventId['root-1']?.replies).toBe(1);
        expect(service.loadEngagement).toHaveBeenNthCalledWith(1, { eventIds: ['root-1', 'reply-a'] });

        await store.loadNextThreadPage();

        expect(store.getState().activeThread?.replies.map((item) => item.id)).toEqual(['reply-a', 'reply-b']);
        expect(service.loadEngagement).toHaveBeenNthCalledWith(2, { eventIds: ['reply-b'] });
        expect(service.loadThread).toHaveBeenLastCalledWith(expect.objectContaining({
            rootEventId: 'root-1',
            until: 449,
        }));
    });

    test('toggleReaction uses optimistic update and rolls back on failure', async () => {
        const service = createServiceMock();
        const writeGateway = createWriteGatewayMock();
        writeGateway.publishEvent.mockRejectedValueOnce(new Error('relay-down'));

        const store = createFollowingFeedStore({
            ownerPubkey: OWNER,
            follows: [FOLLOW_A],
            canWrite: true,
            service,
            writeGateway,
        });

        const pending = store.toggleReaction({ eventId: 'note-1', targetPubkey: FOLLOW_A });

        expect(store.getState().reactionByEventId['note-1']).toBe(true);
        expect(store.getState().pendingReactionByEventId['note-1']).toBe(true);
        expect(store.getState().engagementByEventId['note-1']?.reactions).toBe(1);

        const result = await pending;

        expect(result).toBe(false);
        expect(store.getState().reactionByEventId['note-1']).toBe(false);
        expect(store.getState().pendingReactionByEventId['note-1']).toBe(false);
        expect(store.getState().engagementByEventId['note-1']?.reactions).toBe(0);
        expect(store.getState().publishError).toBe('relay-down');
    });

    test('toggleReaction removes by local reaction event id', async () => {
        const service = createServiceMock();
        const writeGateway = createWriteGatewayMock();
        writeGateway.publishEvent
            .mockResolvedValueOnce({
                id: 'reaction-evt',
                pubkey: OWNER,
                kind: 7,
                created_at: 300,
                tags: [['e', 'note-1']],
                content: '+',
            })
            .mockResolvedValueOnce({
                id: 'delete-evt',
                pubkey: OWNER,
                kind: 5,
                created_at: 301,
                tags: [['e', 'reaction-evt']],
                content: '',
            });

        const store = createFollowingFeedStore({
            ownerPubkey: OWNER,
            follows: [FOLLOW_A],
            canWrite: true,
            service,
            writeGateway,
        });

        const enabled = await store.toggleReaction({ eventId: 'note-1', targetPubkey: FOLLOW_A });
        const disabled = await store.toggleReaction({ eventId: 'note-1', targetPubkey: FOLLOW_A });

        expect(enabled).toBe(true);
        expect(disabled).toBe(true);
        expect(writeGateway.publishEvent).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                kind: 5,
                tags: [['e', 'reaction-evt']],
            })
        );
    });

    test('toggleRepost applies optimistic engagement and rolls back on failure', async () => {
        const service = createServiceMock();
        const writeGateway = createWriteGatewayMock();
        writeGateway.publishEvent.mockRejectedValueOnce(new Error('repost-failed'));

        const store = createFollowingFeedStore({
            ownerPubkey: OWNER,
            follows: [FOLLOW_A],
            canWrite: true,
            service,
            writeGateway,
        });

        const pending = store.toggleRepost({ eventId: 'note-1', targetPubkey: FOLLOW_A });

        expect(store.getState().repostByEventId['note-1']).toBe(true);
        expect(store.getState().engagementByEventId['note-1']?.reposts).toBe(1);

        const result = await pending;

        expect(result).toBe(false);
        expect(store.getState().repostByEventId['note-1']).toBe(false);
        expect(store.getState().engagementByEventId['note-1']?.reposts).toBe(0);
        expect(store.getState().publishError).toBe('repost-failed');
    });

    test('publishPost inserts temp note and replaces it with published event', async () => {
        const service = createServiceMock();
        const writeGateway = createWriteGatewayMock();

        const store = createFollowingFeedStore({
            ownerPubkey: OWNER,
            follows: [FOLLOW_A],
            canWrite: true,
            service,
            writeGateway,
            now: () => 777,
        });

        const pending = store.publishPost(' hola   mundo ');

        expect(store.getState().items.some((item) => item.id.startsWith('temp-post:'))).toBe(true);

        const result = await pending;

        expect(result).toBe(true);
        expect(store.getState().items.some((item) => item.id.startsWith('temp-post:'))).toBe(false);
        expect(store.getState().items.some((item) => item.id === 'published-note')).toBe(true);
        expect(writeGateway.publishTextNote).toHaveBeenCalledWith('hola mundo', []);
    });

    test('keeps hasMoreFeed disabled when follows are empty', async () => {
        const service = createServiceMock();
        const store = createFollowingFeedStore({
            ownerPubkey: OWNER,
            follows: [],
            canWrite: true,
            service,
            writeGateway: createWriteGatewayMock(),
        });

        expect(store.getState().hasMoreFeed).toBe(false);

        await store.openDialog();

        expect(service.loadFollowingFeed).not.toHaveBeenCalled();
        expect(store.getState().hasMoreFeed).toBe(false);
    });

    test('publishReply builds root/reply tags from active thread', async () => {
        const service = createServiceMock({
            loadThread: async () => ({
                root: {
                    id: 'root-1',
                    pubkey: FOLLOW_A,
                    createdAt: 500,
                    eventKind: 1,
                    content: 'root',
                    rawEvent: {
                        id: 'root-1',
                        pubkey: FOLLOW_A,
                        kind: 1,
                        created_at: 500,
                        tags: [],
                        content: 'root',
                    },
                },
                replies: [],
                hasMore: false,
            }),
        });
        const writeGateway = createWriteGatewayMock();

        const store = createFollowingFeedStore({
            ownerPubkey: OWNER,
            follows: [FOLLOW_A],
            canWrite: true,
            service,
            writeGateway,
            now: () => 900,
        });

        await store.openThread('root-1');
        const result = await store.publishReply({
            targetEventId: 'root-1',
            targetPubkey: FOLLOW_A,
            content: 'respuesta',
        });

        expect(result).toBe(true);
        expect(store.getState().engagementByEventId['root-1']?.replies).toBe(1);
        expect(writeGateway.publishTextNote).toHaveBeenCalledWith(
            'respuesta',
            expect.arrayContaining([
                ['e', 'root-1', '', 'root'],
                ['e', 'root-1', '', 'reply'],
                ['p', FOLLOW_A],
            ])
        );
    });
});
