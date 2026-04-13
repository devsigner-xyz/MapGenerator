import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nostrOverlayQueryKeys } from './keys';
import {
    createNostrOverlayQueryClient,
    getNostrOverlayQueryTimingProfile,
    nostrOverlayQueryTimingProfiles,
} from './query-client';
import {
    createIdentityQueryOptions,
    createMetadataQueryOptions,
    createRealtimeQueryOptions,
    createSocialQueryOptions,
} from './options';

const currentDir = dirname(fileURLToPath(import.meta.url));
const followingFeedControllerSourcePath = resolve(currentDir, '../hooks/useFollowingFeedController.ts');
const followingFeedQuerySourcePath = resolve(currentDir, './following-feed.query.ts');
const activeProfileQuerySourcePath = resolve(currentDir, './active-profile.query.ts');
const directMessagesQuerySourcePath = resolve(currentDir, './direct-messages.query.ts');
const socialNotificationsQuerySourcePath = resolve(currentDir, './social-notifications.query.ts');
const relayMetadataQuerySourcePath = resolve(currentDir, './relay-metadata.query.ts');
const nip05QuerySourcePath = resolve(currentDir, './nip05.query.ts');

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

    test('enforces granular invalidation scopes in following feed mutations', () => {
        const source = readFileSync(followingFeedControllerSourcePath, 'utf8');

        expect(source).not.toContain('queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.social() })');
        expect(source).toContain('queryClient.invalidateQueries({ queryKey: nostrOverlayQueryKeys.invalidation.followingFeed() })');
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

    test('exposes options factories by domain', () => {
        expect(typeof createSocialQueryOptions).toBe('function');
        expect(typeof createMetadataQueryOptions).toBe('function');
        expect(typeof createIdentityQueryOptions).toBe('function');
        expect(typeof createRealtimeQueryOptions).toBe('function');
    });

    test('enforces domain timing contracts in options factories', () => {
        const queryFn = async () => ({ ok: true as const });
        const social = createSocialQueryOptions({
            queryKey: ['nostr-overlay', 'social', 'contract'] as const,
            queryFn,
        });
        const metadata = createMetadataQueryOptions({
            queryKey: ['nostr-overlay', 'metadata', 'contract'] as const,
            queryFn,
        });
        const identity = createIdentityQueryOptions({
            queryKey: ['nostr-overlay', 'identity', 'contract'] as const,
            queryFn,
        });
        const realtime = createRealtimeQueryOptions({
            queryKey: ['nostr-overlay', 'realtime', 'contract'] as const,
            queryFn,
        });

        expect(metadata.staleTime).toBeGreaterThan(social.staleTime ?? 0);
        expect(realtime.staleTime).toBeLessThan(social.staleTime ?? Number.MAX_SAFE_INTEGER);
        expect(identity.staleTime).toBeGreaterThan(metadata.staleTime ?? 0);

        expect(typeof social.retry).toBe('function');
        expect(typeof metadata.retry).toBe('function');
        expect(typeof identity.retry).toBe('function');
        expect(typeof realtime.retry).toBe('function');

        if (typeof social.retry === 'function') {
            expect(social.retry(0, new Error('status 500'))).toBe(true);
            expect(social.retry(1, new Error('status 500'))).toBe(false);
        }

        if (typeof metadata.retry === 'function') {
            expect(metadata.retry(0, new Error('status 500'))).toBe(true);
            expect(metadata.retry(1, new Error('status 500'))).toBe(false);
        }

        if (typeof identity.retry === 'function') {
            expect(identity.retry(0, new Error('status 404'))).toBe(false);
            expect(identity.retry(0, new Error('invalid identifier'))).toBe(false);
        }

        if (typeof realtime.retry === 'function') {
            expect(realtime.retry(0, new Error('status 500'))).toBe(false);
        }
    });

    test('keeps contract consistency by using shared option factories in overlay queries', () => {
        const followingFeedSource = readFileSync(followingFeedQuerySourcePath, 'utf8');
        const activeProfileSource = readFileSync(activeProfileQuerySourcePath, 'utf8');
        const directMessagesSource = readFileSync(directMessagesQuerySourcePath, 'utf8');
        const socialNotificationsSource = readFileSync(socialNotificationsQuerySourcePath, 'utf8');
        const relayMetadataSource = readFileSync(relayMetadataQuerySourcePath, 'utf8');
        const nip05Source = readFileSync(nip05QuerySourcePath, 'utf8');

        expect(followingFeedSource).toContain('createSocialQueryOptions');
        expect(activeProfileSource).toContain('createSocialQueryOptions');
        expect(directMessagesSource).toContain('createSocialQueryOptions');
        expect(socialNotificationsSource).toContain('createSocialQueryOptions');
        expect(relayMetadataSource).toContain('createMetadataQueryOptions');
        expect(nip05Source).toContain('createIdentityQueryOptions');

        expect(activeProfileSource).not.toContain('staleTime: 5 * 60_000');
        expect(relayMetadataSource).not.toContain('retry: 1');
        expect(relayMetadataSource).not.toContain('staleTime: RELAY_METADATA_STALE_TIME_MS');
        expect(nip05Source).not.toContain('staleTime: NIP05_STALE_TIME_MS');
    });
});
