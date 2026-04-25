import { describe, expect, test } from 'vitest';
import type { SocialNotificationItem } from '../../nostr/social-notifications-service';
import { buildNotificationInboxSections } from './social-notifications-inbox';

function buildItem(overrides: Partial<SocialNotificationItem> = {}): SocialNotificationItem {
    return {
        id: 'notif-1',
        kind: 7,
        actorPubkey: 'a'.repeat(64),
        createdAt: 100,
        content: '+',
        targetEventId: 'b'.repeat(64),
        targetPubkey: 'c'.repeat(64),
        rawEvent: {
            id: 'notif-1',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 100,
            tags: [['p', 'c'.repeat(64)], ['e', 'b'.repeat(64)]],
            content: '+',
        },
        ...overrides,
    };
}

describe('buildNotificationInboxSections', () => {
    test('groups zaps by target event and sums sats', () => {
        const targetEventId = 'd'.repeat(64);

        const sections = buildNotificationInboxSections({
            newNotifications: [
                buildItem({
                    id: 'zap-1',
                    kind: 9735,
                    actorPubkey: '1'.repeat(64),
                    createdAt: 120,
                    targetEventId,
                    content: 'zap-1',
                    rawEvent: {
                        id: 'zap-1',
                        pubkey: '1'.repeat(64),
                        kind: 9735,
                        created_at: 120,
                        tags: [['p', 'c'.repeat(64)], ['e', targetEventId], ['amount', '21000']],
                        content: 'zap-1',
                    },
                }),
                buildItem({
                    id: 'zap-2',
                    kind: 9735,
                    actorPubkey: '2'.repeat(64),
                    createdAt: 125,
                    targetEventId,
                    content: 'zap-2',
                    rawEvent: {
                        id: 'zap-2',
                        pubkey: '2'.repeat(64),
                        kind: 9735,
                        created_at: 125,
                        tags: [['p', 'c'.repeat(64)], ['e', targetEventId], ['amount', '42000']],
                        content: 'zap-2',
                    },
                }),
            ],
            recentNotifications: [],
        });

        expect(sections.newItems).toHaveLength(1);
        expect(sections.newItems[0]).toMatchObject({
            category: 'zap',
            targetEventId,
            itemCount: 2,
            occurredAt: 125,
            primaryActorPubkey: '2'.repeat(64),
            zapTotalSats: 63,
        });
        expect(sections.newItems[0]?.actors.map((actor) => actor.pubkey)).toEqual(['2'.repeat(64), '1'.repeat(64)]);
        expect(sections.newItems[0]?.sourceItems.map((item) => item.id)).toEqual(['zap-2', 'zap-1']);
    });

    test('uses bolt11 invoice amount when zap receipt amount tags are missing', () => {
        const targetEventId = 'd'.repeat(64);

        const sections = buildNotificationInboxSections({
            newNotifications: [
                buildItem({
                    id: 'zap-bolt11',
                    kind: 9735,
                    actorPubkey: '1'.repeat(64),
                    targetEventId,
                    rawEvent: {
                        id: 'zap-bolt11',
                        pubkey: '1'.repeat(64),
                        kind: 9735,
                        created_at: 120,
                        tags: [['p', 'c'.repeat(64)], ['e', targetEventId], ['bolt11', 'lnbc210n1pzapreceipt']],
                        content: 'zap-bolt11',
                    },
                }),
            ],
            recentNotifications: [],
        });

        expect(sections.newItems[0]).toMatchObject({
            category: 'zap',
            zapTotalSats: 21,
        });
    });

    test('groups reactions by target event and reaction content', () => {
        const targetEventId = 'e'.repeat(64);

        const sections = buildNotificationInboxSections({
            newNotifications: [
                buildItem({ id: 'reaction-like', actorPubkey: '1'.repeat(64), targetEventId, content: '+' }),
                buildItem({ id: 'reaction-heart', actorPubkey: '2'.repeat(64), targetEventId, content: '❤️' }),
                buildItem({ id: 'reaction-heart-2', actorPubkey: '3'.repeat(64), targetEventId, content: '❤️', createdAt: 101 }),
            ],
            recentNotifications: [],
        });

        expect(sections.newItems).toHaveLength(2);
        expect(sections.newItems.map((item) => item.reactionContent)).toEqual(['❤️', '+']);
        expect(sections.newItems[0]).toMatchObject({
            category: 'reaction',
            itemCount: 2,
            occurredAt: 101,
            reactionContent: '❤️',
        });
    });

    test('classifies notes with explicit reply markers as reply and ambiguous note references as mention', () => {
        const targetEventId = 'f'.repeat(64);

        const sections = buildNotificationInboxSections({
            newNotifications: [
                buildItem({
                    id: 'reply-1',
                    kind: 1,
                    createdAt: 101,
                    targetEventId,
                    content: 'respuesta',
                    rawEvent: {
                        id: 'reply-1',
                        pubkey: '1'.repeat(64),
                        kind: 1,
                        created_at: 101,
                        tags: [['p', 'c'.repeat(64)], ['e', targetEventId, '', 'reply']],
                        content: 'respuesta',
                    },
                }),
                buildItem({
                    id: 'mention-1',
                    kind: 1,
                    createdAt: 100,
                    targetEventId,
                    content: 'mencion',
                    rawEvent: {
                        id: 'mention-1',
                        pubkey: '2'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [['p', 'c'.repeat(64)], ['e', targetEventId]],
                        content: 'mencion',
                    },
                }),
            ],
            recentNotifications: [],
        });

        expect(sections.newItems[0]?.category).toBe('reply');
        expect(sections.newItems[1]?.category).toBe('mention');
    });

    test('keeps root-only kind 1 references as mention to stay conservative', () => {
        const targetEventId = '8'.repeat(64);

        const sections = buildNotificationInboxSections({
            newNotifications: [
                buildItem({
                    id: 'root-only',
                    kind: 1,
                    createdAt: 101,
                    targetEventId,
                    rawEvent: {
                        id: 'root-only',
                        pubkey: '1'.repeat(64),
                        kind: 1,
                        created_at: 101,
                        tags: [['p', 'c'.repeat(64)], ['e', targetEventId, '', 'root']],
                        content: 'root reference',
                    },
                }),
            ],
            recentNotifications: [],
        });

        expect(sections.newItems[0]?.category).toBe('mention');
    });

    test('keeps repost kind 6 and 16 in separate groups for the same target event', () => {
        const targetEventId = '9'.repeat(64);

        const sections = buildNotificationInboxSections({
            newNotifications: [
                buildItem({ id: 'repost-kind-6', kind: 6, targetEventId, createdAt: 101 }),
                buildItem({ id: 'repost-kind-16', kind: 16, targetEventId, createdAt: 100 }),
            ],
            recentNotifications: [],
        });

        expect(sections.newItems).toHaveLength(2);
        expect(sections.newItems.map((item) => item.sourceKinds)).toEqual([[6], [16]]);
    });

    test('keeps older recent history for the same group while excluding only overlapping source events', () => {
        const targetEventId = '7'.repeat(64);

        const sections = buildNotificationInboxSections({
            newNotifications: [
                buildItem({ id: 'new-heart', createdAt: 110, targetEventId, content: '❤️' }),
            ],
            recentNotifications: [
                buildItem({ id: 'recent-heart', createdAt: 90, targetEventId, content: '❤️' }),
                buildItem({ id: 'recent-plus', createdAt: 80, targetEventId, content: '+' }),
            ],
        });

        expect(sections.newItems).toHaveLength(1);
        expect(sections.recentItems).toHaveLength(2);
        expect(sections.recentItems.map((item) => item.reactionContent)).toEqual(['❤️', '+']);
        expect(sections.recentItems[0]?.sourceItems.map((item) => item.id)).toEqual(['recent-heart']);
    });
});
