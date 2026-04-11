import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    buildSocialLastReadStorageKey,
    createSocialNotificationsStore,
    createSocialReadStateStorage,
} from './useSocialNotifications';
import type { SocialNotificationEvent, SocialNotificationsService } from '../../nostr/social-notifications-service';

const OWNER_A = 'a'.repeat(64);
const OWNER_B = 'b'.repeat(64);
const ACTOR = 'c'.repeat(64);

function socialEvent(overrides: Partial<SocialNotificationEvent> = {}): SocialNotificationEvent {
    return {
        id: `evt-${Math.random().toString(16).slice(2, 10)}`,
        pubkey: ACTOR,
        kind: 1,
        created_at: 100,
        tags: [['p', OWNER_A], ['e', 'f'.repeat(64)]],
        content: 'hola',
        ...overrides,
    };
}

function createServiceMock() {
    let listener: ((event: SocialNotificationEvent) => void) | null = null;
    const service: SocialNotificationsService = {
        subscribeSocial: vi.fn((_input, onEvent) => {
            listener = onEvent;
            return () => {
                listener = null;
            };
        }),
        loadInitialSocial: vi.fn(async () => []),
    };

    return {
        service,
        emit(event: SocialNotificationEvent) {
            listener?.(event);
        },
    };
}

beforeEach(() => {
    window.localStorage.clear();
});

describe('useSocialNotifications store', () => {
    test('sets hasUnread true when a social event arrives', async () => {
        const { service, emit } = createServiceMock();
        const storage = createSocialReadStateStorage({
            storage: window.localStorage,
            version: 'v1',
        });
        const store = createSocialNotificationsStore({
            ownerPubkey: OWNER_A,
            service,
            storage,
            now: () => 200,
        });

        await store.start();
        emit(socialEvent({ id: 'evt-1', created_at: 120 }));

        const state = store.getState();
        expect(state.hasUnread).toBe(true);
        expect(state.items).toHaveLength(1);
        expect(state.items[0].id).toBe('evt-1');

        store.dispose();
    });

    test('openDialog marks pending notifications as read', async () => {
        const { service, emit } = createServiceMock();
        const storage = createSocialReadStateStorage({
            storage: window.localStorage,
            version: 'v1',
        });
        const store = createSocialNotificationsStore({
            ownerPubkey: OWNER_A,
            service,
            storage,
            now: () => 150,
        });

        await store.start();
        emit(socialEvent({ id: 'evt-1', created_at: 120 }));
        expect(store.getState().hasUnread).toBe(true);

        store.openDialog();

        const state = store.getState();
        expect(state.isDialogOpen).toBe(true);
        expect(state.hasUnread).toBe(false);
        expect(state.lastReadAt).toBe(150);
        expect(state.pendingSnapshot.map((item) => item.id)).toEqual(['evt-1']);

        const key = buildSocialLastReadStorageKey(OWNER_A, 'v1');
        expect(window.localStorage.getItem(key)).toBe(JSON.stringify({ lastReadAt: 150 }));

        store.dispose();
    });

    test('keeps pending snapshot stable after dialog opens', async () => {
        const { service, emit } = createServiceMock();
        const storage = createSocialReadStateStorage({
            storage: window.localStorage,
            version: 'v1',
        });
        const store = createSocialNotificationsStore({
            ownerPubkey: OWNER_A,
            service,
            storage,
            now: () => 150,
        });

        await store.start();
        emit(socialEvent({ id: 'evt-1', created_at: 120 }));
        emit(socialEvent({ id: 'evt-2', created_at: 110 }));

        store.openDialog();
        expect(store.getState().pendingSnapshot.map((item) => item.id)).toEqual(['evt-1', 'evt-2']);

        emit(socialEvent({ id: 'evt-3', created_at: 170 }));

        const state = store.getState();
        expect(state.hasUnread).toBe(true);
        expect(state.pendingSnapshot.map((item) => item.id)).toEqual(['evt-1', 'evt-2']);

        store.dispose();
    });

    test('deduplicates notifications by event id', async () => {
        const { service, emit } = createServiceMock();
        const storage = createSocialReadStateStorage({
            storage: window.localStorage,
            version: 'v1',
        });
        const store = createSocialNotificationsStore({
            ownerPubkey: OWNER_A,
            service,
            storage,
            now: () => 200,
        });

        await store.start();
        emit(socialEvent({ id: 'evt-1', created_at: 120 }));
        emit(socialEvent({ id: 'evt-1', created_at: 121, content: 'updated duplicate' }));

        expect(store.getState().items).toHaveLength(1);

        store.dispose();
    });

    test('isolates social read storage per owner', () => {
        const storage = createSocialReadStateStorage({
            storage: window.localStorage,
            version: 'v1',
        });

        storage.setLastReadAt(OWNER_A, 100);
        storage.setLastReadAt(OWNER_B, 200);

        expect(storage.getLastReadAt(OWNER_A)).toBe(100);
        expect(storage.getLastReadAt(OWNER_B)).toBe(200);
    });

    test('ignores self-authored and non-targeted events', async () => {
        const { service, emit } = createServiceMock();
        const storage = createSocialReadStateStorage({
            storage: window.localStorage,
            version: 'v1',
        });
        const store = createSocialNotificationsStore({
            ownerPubkey: OWNER_A,
            service,
            storage,
            now: () => 200,
        });

        await store.start();
        emit(socialEvent({ id: 'self-1', pubkey: OWNER_A, created_at: 120 }));
        emit(socialEvent({ id: 'other-1', tags: [['p', OWNER_B]], created_at: 121 }));

        expect(store.getState().items).toHaveLength(0);
        expect(store.getState().hasUnread).toBe(false);

        store.dispose();
    });
});
