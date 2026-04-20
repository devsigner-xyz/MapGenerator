import { buildStorageScopeKeys } from './storage-scope';
import type { WalletActivityItem, WalletActivityState } from './wallet-types';

export const WALLET_ACTIVITY_STORAGE_KEY = 'nostr.overlay.wallet-activity.v1';
export const WALLET_ACTIVITY_MAX_ITEMS = 20;

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface WalletActivityOptions {
    ownerPubkey?: string;
    storage?: StorageLike | null;
}

interface WalletActivityPayload {
    items?: WalletActivityItem[];
}

function getDefaultStorage(): StorageLike | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function resolveStorage(options: WalletActivityOptions): StorageLike | null {
    return options.storage ?? getDefaultStorage();
}

function normalizeItem(item: WalletActivityItem): WalletActivityItem {
    return {
        ...item,
        provider: item.provider === 'webln' ? 'webln' : 'nwc',
        status: item.status === 'succeeded' || item.status === 'failed' ? item.status : 'pending',
        actionType: item.actionType === 'manual-receive' ? 'manual-receive' : 'zap-payment',
        targetType: item.targetType,
        amountMsats: Math.max(0, Math.round(item.amountMsats)),
        createdAt: Math.round(item.createdAt),
    };
}

function normalizeItems(items: WalletActivityItem[]): WalletActivityItem[] {
    return items
        .map((item) => normalizeItem(item))
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, WALLET_ACTIVITY_MAX_ITEMS);
}

function parseState(raw: string | null): WalletActivityState {
    if (!raw) {
        return getDefaultWalletActivityState();
    }

    try {
        const parsed = JSON.parse(raw) as WalletActivityPayload;
        if (!Array.isArray(parsed.items)) {
            return getDefaultWalletActivityState();
        }

        return {
            items: normalizeItems(parsed.items),
        };
    } catch {
        return getDefaultWalletActivityState();
    }
}

export function getDefaultWalletActivityState(): WalletActivityState {
    return {
        items: [],
    };
}

export function loadWalletActivity(options: WalletActivityOptions = {}): WalletActivityState {
    const storage = resolveStorage(options);
    if (!storage) {
        return getDefaultWalletActivityState();
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: WALLET_ACTIVITY_STORAGE_KEY }
            : { baseKey: WALLET_ACTIVITY_STORAGE_KEY, ownerPubkey: options.ownerPubkey }
    );

    if (!keys.normalizedOwnerPubkey) {
        return parseState(storage.getItem(WALLET_ACTIVITY_STORAGE_KEY));
    }

    const scopedRaw = storage.getItem(keys.scopedKey);
    if (scopedRaw !== null) {
        return parseState(scopedRaw);
    }

    if (storage.getItem(keys.legacyMigrationMarkerKey)) {
        return getDefaultWalletActivityState();
    }

    const legacy = parseState(storage.getItem(WALLET_ACTIVITY_STORAGE_KEY));
    storage.setItem(keys.scopedKey, JSON.stringify(legacy));
    storage.setItem(keys.legacyMigrationMarkerKey, keys.normalizedOwnerPubkey);
    return legacy;
}

export function saveWalletActivity(
    state: WalletActivityState,
    options: WalletActivityOptions = {}
): WalletActivityState {
    const nextState: WalletActivityState = {
        items: normalizeItems(state.items),
    };
    const storage = resolveStorage(options);
    if (!storage) {
        return nextState;
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: WALLET_ACTIVITY_STORAGE_KEY }
            : { baseKey: WALLET_ACTIVITY_STORAGE_KEY, ownerPubkey: options.ownerPubkey }
    );
    const payload: WalletActivityPayload = { items: nextState.items };

    if (keys.normalizedOwnerPubkey) {
        storage.setItem(keys.scopedKey, JSON.stringify(payload));
    } else {
        storage.setItem(WALLET_ACTIVITY_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}

export function addWalletActivity(state: WalletActivityState, item: WalletActivityItem): WalletActivityState {
    return {
        items: normalizeItems([item, ...state.items]),
    };
}

export function markWalletActivitySucceeded(
    state: WalletActivityState,
    id: string,
    update: Pick<WalletActivityItem, 'invoice' | 'expiresAt'> = {}
): WalletActivityState {
    return {
        items: normalizeItems(state.items.map((item) => item.id === id ? { ...item, ...update, status: 'succeeded' } : item)),
    };
}

export function markWalletActivityFailed(
    state: WalletActivityState,
    id: string,
    errorMessage: string
): WalletActivityState {
    return {
        items: normalizeItems(state.items.map((item) => item.id === id ? { ...item, status: 'failed', errorMessage } : item)),
    };
}
