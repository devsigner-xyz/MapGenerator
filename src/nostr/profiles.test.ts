import { describe, expect, test } from 'vitest';
import { parseProfileMetadata } from './profiles';
import type { NostrEvent } from './types';

function buildMetadataEvent(content: Record<string, unknown>): NostrEvent {
    return {
        id: 'metadata-1',
        pubkey: 'a'.repeat(64),
        kind: 0,
        created_at: 1_700_000_000,
        tags: [],
        content: JSON.stringify(content),
        sig: 'b'.repeat(128),
    };
}

describe('parseProfileMetadata', () => {
    test('parses profile about and optional NIP-24 style fields', () => {
        const profile = parseProfileMetadata(buildMetadataEvent({
            name: 'alice',
            display_name: 'Alice',
            about: 'Building with Nostr',
            picture: 'https://example.com/avatar.png',
            banner: 'https://example.com/banner.png',
            website: 'https://example.com',
            nip05: 'alice@example.com',
            lud16: 'alice@getalby.com',
            lud06: 'lnurl1dp68gurn8ghj7',
            bot: true,
            github: 'alice',
            mastodon: 'nostr.example/@alice',
        }));

        expect(profile.name).toBe('alice');
        expect(profile.displayName).toBe('Alice');
        expect(profile.about).toBe('Building with Nostr');
        expect(profile.picture).toBe('https://example.com/avatar.png');
        expect(profile.banner).toBe('https://example.com/banner.png');
        expect(profile.website).toBe('https://example.com');
        expect(profile.nip05).toBe('alice@example.com');
        expect(profile.lud16).toBe('alice@getalby.com');
        expect(profile.lud06).toBe('lnurl1dp68gurn8ghj7');
        expect(profile.bot).toBe(true);
        expect(profile.externalIdentities).toEqual(['github:alice', 'mastodon:nostr.example/@alice']);
    });
});
