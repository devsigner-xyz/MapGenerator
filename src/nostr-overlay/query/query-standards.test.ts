import { describe, expect, test } from 'vitest';
import { nostrOverlayQueryKeys } from './keys';
import {
    createNostrOverlayQueryClient,
    getNostrOverlayQueryTimingProfile,
    nostrOverlayQueryTimingProfiles,
} from './query-client';

describe('nostr overlay query standards', () => {
    test('normalizes deterministic key shapes', () => {
        expect(
            nostrOverlayQueryKeys.followingFeed({
                ownerPubkey: 'owner',
                follows: ['b', '', 'a', 'a'],
                pageSize: 20,
            })
        ).toEqual(
            nostrOverlayQueryKeys.followingFeed({
                ownerPubkey: 'owner',
                follows: ['a', 'b'],
                pageSize: 20,
            })
        );

        expect(
            nostrOverlayQueryKeys.engagement({ eventIds: ['id-2', 'id-1', 'id-2'] })
        ).toEqual(
            ['nostr-overlay', 'social', 'engagement', { eventIds: ['id-1', 'id-2'] }]
        );

        expect(
            nostrOverlayQueryKeys.userSearch({ term: '  alice  ' })
        ).toEqual(
            ['nostr-overlay', 'social', 'search', { term: 'alice' }]
        );
    });

    test('exposes explicit invalidation scopes by domain', () => {
        expect(nostrOverlayQueryKeys.invalidation.social()).toEqual(nostrOverlayQueryKeys.social());
        expect(nostrOverlayQueryKeys.invalidation.followingFeed()).toEqual(['nostr-overlay', 'social', 'following-feed']);
        expect(nostrOverlayQueryKeys.invalidation.notifications()).toEqual(['nostr-overlay', 'social', 'notifications']);
        expect(nostrOverlayQueryKeys.invalidation.directMessages()).toEqual(['nostr-overlay', 'social', 'direct-messages']);
        expect(nostrOverlayQueryKeys.invalidation.userSearch()).toEqual(['nostr-overlay', 'social', 'search']);
        expect(nostrOverlayQueryKeys.invalidation.nip05()).toEqual(['nostr-overlay', 'social', 'nip05']);
        expect(nostrOverlayQueryKeys.invalidation.relayMetadata()).toEqual(['nostr-overlay', 'social', 'relay-metadata']);
        expect(nostrOverlayQueryKeys.invalidation.activeProfile()).toEqual(['nostr-overlay', 'social', 'active-profile']);
    });

    test('uses timing profiles and social defaults consistently', () => {
        const realtime = getNostrOverlayQueryTimingProfile('realtime');
        const social = getNostrOverlayQueryTimingProfile('social');
        const metadata = getNostrOverlayQueryTimingProfile('metadata');
        const identity = getNostrOverlayQueryTimingProfile('identity');

        expect(metadata.staleTime).toBeGreaterThan(social.staleTime);
        expect(identity.staleTime).toBeGreaterThan(metadata.staleTime);
        expect(realtime.staleTime).toBeLessThan(social.staleTime);

        const queryClient = createNostrOverlayQueryClient();
        const defaults = queryClient.getDefaultOptions().queries;
        expect(defaults?.staleTime).toBe(nostrOverlayQueryTimingProfiles.social.staleTime);
        expect(defaults?.gcTime).toBe(nostrOverlayQueryTimingProfiles.social.gcTime);

        const retry = defaults?.retry;
        expect(typeof retry).toBe('function');
        if (typeof retry === 'function') {
            expect(retry(0, new Error('status 500'))).toBe(true);
            expect(retry(1, new Error('status 500'))).toBe(false);
            expect(retry(0, new Error('relay timeout'))).toBe(false);
        }
    });
});
