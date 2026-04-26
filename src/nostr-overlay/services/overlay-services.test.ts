import { describe, expect, expectTypeOf, test } from 'vitest';
import type { GraphApiService } from '../../nostr-api/graph-api-service';
import type { IdentityApiService } from '../../nostr-api/identity-api-service';
import type { UserSearchApiService } from '../../nostr-api/user-search-api-service';
import type { SocialFeedService } from '../../nostr/social-feed-service';
import type { SocialNotificationsService } from '../../nostr/social-notifications-service';
import type { DirectMessagesService } from '../query/direct-messages.query';
import type { SocialPublisher } from '../social-publisher';
import { createBootstrapOverlayServices } from '../bootstrap';
import { createOverlayServices, type OverlayServices } from './overlay-services';

describe('createOverlayServices', () => {
    test('returns the already-built overlay services unchanged', () => {
        const services = {
            createClient: () => ({
                connect: async () => {},
                fetchLatestReplaceableEvent: async () => null,
                fetchEvents: async () => [],
            }),
            graphApiService: {} as GraphApiService,
            socialFeedService: {} as SocialFeedService,
            socialNotificationsService: {} as SocialNotificationsService,
            directMessagesService: {} as DirectMessagesService,
            identityApiService: {} as IdentityApiService,
            userSearchApiService: {} as UserSearchApiService,
            socialPublisher: {} as SocialPublisher,
        } satisfies OverlayServices;

        expect(createOverlayServices(services)).toBe(services);
    });

    test('exposes the service interfaces consumed by the overlay boundary', () => {
        expectTypeOf<OverlayServices['graphApiService']>().toEqualTypeOf<GraphApiService | undefined>();
        expectTypeOf<OverlayServices['socialFeedService']>().toEqualTypeOf<SocialFeedService | undefined>();
        expectTypeOf<OverlayServices['socialNotificationsService']>().toEqualTypeOf<SocialNotificationsService | undefined>();
        expectTypeOf<OverlayServices['directMessagesService']>().toEqualTypeOf<DirectMessagesService | undefined>();
        expectTypeOf<OverlayServices['identityApiService']>().toEqualTypeOf<IdentityApiService | undefined>();
        expectTypeOf<OverlayServices['userSearchApiService']>().toEqualTypeOf<UserSearchApiService | undefined>();
        expectTypeOf<OverlayServices['socialPublisher']>().toEqualTypeOf<SocialPublisher | undefined>();
    });

    test('bootstrap builds the runtime and API services before registering them', () => {
        const services = createBootstrapOverlayServices();

        expect(services.createClient).toEqual(expect.any(Function));
        expect(services.graphApiService).toEqual(expect.objectContaining({
            loadFollows: expect.any(Function),
            loadFollowers: expect.any(Function),
        }));
        expect(services.socialFeedService).toEqual(expect.objectContaining({
            loadFollowingFeed: expect.any(Function),
            loadThread: expect.any(Function),
        }));
        expect(services.socialNotificationsService).toEqual(expect.objectContaining({
            subscribeSocial: expect.any(Function),
            loadInitialSocial: expect.any(Function),
        }));
        expect(services.directMessagesService).toEqual(expect.objectContaining({
            subscribeInbox: expect.any(Function),
            loadInitialConversations: expect.any(Function),
            loadConversationMessages: expect.any(Function),
        }));
        expect(services.identityApiService).toEqual(expect.objectContaining({
            resolveProfiles: expect.any(Function),
            verifyNip05Batch: expect.any(Function),
        }));
        expect(services.userSearchApiService).toEqual(expect.objectContaining({
            searchUsers: expect.any(Function),
        }));
        expect(services.socialPublisher).toEqual(expect.objectContaining({
            publishEvent: expect.any(Function),
            publishTextNote: expect.any(Function),
        }));
    });
});
