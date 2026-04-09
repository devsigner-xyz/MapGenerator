import { describe, expect, it, vi } from 'vitest';
import type { NostrClient, NostrEvent, NostrFilter } from './types';
import { createLazyNdkClient } from './lazy-ndk-client';

function createClientMock(): NostrClient {
    return {
        connect: vi.fn(async () => undefined),
        fetchEvents: vi.fn(async (_filter: NostrFilter): Promise<NostrEvent[]> => []),
        fetchLatestReplaceableEvent: vi.fn(async () => null),
    };
}

describe('createLazyNdkClient', () => {
    it('defers module loading until first method call', async () => {
        const clientMock = createClientMock();
        const ndkCtor = vi.fn(function NdkClientMock() {
            return clientMock;
        });
        const importer = vi.fn(async () => ({
            NdkClient: ndkCtor,
        }));

        const lazyClient = createLazyNdkClient({
            relays: ['wss://relay.example'],
            importer,
        });

        expect(importer).not.toHaveBeenCalled();
        await lazyClient.connect();
        expect(importer).toHaveBeenCalledTimes(1);
        expect(ndkCtor).toHaveBeenCalledTimes(1);
    });

    it('reuses the same loaded client instance for subsequent calls', async () => {
        const clientMock = createClientMock();
        const ndkCtor = vi.fn(function NdkClientMock() {
            return clientMock;
        });
        const importer = vi.fn(async () => ({
            NdkClient: ndkCtor,
        }));

        const lazyClient = createLazyNdkClient({
            relays: ['wss://relay.one'],
            importer,
        });

        await lazyClient.connect();
        await lazyClient.fetchEvents({ kinds: [1] });
        await lazyClient.fetchLatestReplaceableEvent('pubkey', 3);

        expect(importer).toHaveBeenCalledTimes(1);
        expect(ndkCtor).toHaveBeenCalledTimes(1);
        expect(ndkCtor).toHaveBeenCalledWith(['wss://relay.one']);
    });
});
