interface ScopedStorageKeyInput {
    baseKey: string;
    ownerPubkey?: string;
}

function normalizeOwnerPubkey(ownerPubkey?: string): string {
    if (typeof ownerPubkey !== 'string') {
        return '';
    }

    return ownerPubkey.trim().toLowerCase();
}

export function buildScopedStorageKey(baseKey: string, ownerPubkey?: string): string {
    return buildStorageScopeKeys(
        ownerPubkey === undefined
            ? { baseKey }
            : { baseKey, ownerPubkey }
    ).scopedKey;
}

export function buildStorageScopeKeys({ baseKey, ownerPubkey }: ScopedStorageKeyInput): {
    normalizedOwnerPubkey: string;
    scopedKey: string;
    legacyMigrationMarkerKey: string;
} {
    const normalizedOwnerPubkey = normalizeOwnerPubkey(ownerPubkey);

    return {
        normalizedOwnerPubkey,
        scopedKey: normalizedOwnerPubkey
            ? `${baseKey}:user:${normalizedOwnerPubkey}`
            : baseKey,
        legacyMigrationMarkerKey: `${baseKey}:legacy-migrated-user`,
    };
}
