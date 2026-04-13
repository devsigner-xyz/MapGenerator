import { describe, expect, test } from 'vitest';
import { buildScopedStorageKey, buildStorageScopeKeys } from './storage-scope';

describe('storage scope keys', () => {
    test('builds user scoped key when owner pubkey exists', () => {
        expect(buildScopedStorageKey('nostr.overlay.easter-eggs.v1', 'A'.repeat(64))).toBe(
            `nostr.overlay.easter-eggs.v1:user:${'a'.repeat(64)}`
        );
    });

    test('returns base key when owner pubkey is missing', () => {
        expect(buildScopedStorageKey('nostr.overlay.easter-eggs.v1')).toBe('nostr.overlay.easter-eggs.v1');
    });

    test('returns migration marker with deterministic suffix', () => {
        expect(buildStorageScopeKeys({
            baseKey: 'nostr.overlay.zaps.v1',
            ownerPubkey: 'f'.repeat(64),
        }).legacyMigrationMarkerKey).toBe('nostr.overlay.zaps.v1:legacy-migrated-user');
    });
});
