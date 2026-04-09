import type { NostrClient } from './types';

interface NdkModule {
    NdkClient: new (relays?: string[]) => NostrClient;
}

export interface CreateLazyNdkClientOptions {
    relays?: string[];
    importer?: () => Promise<NdkModule>;
}

const defaultImporter = (): Promise<NdkModule> => import('./ndk-client');

export function createLazyNdkClient(options: CreateLazyNdkClientOptions = {}): NostrClient {
    const relays = options.relays ?? [];
    const importer = options.importer ?? defaultImporter;
    let clientPromise: Promise<NostrClient> | null = null;

    const getClient = async (): Promise<NostrClient> => {
        if (!clientPromise) {
            clientPromise = importer().then((mod) => new mod.NdkClient(relays));
        }

        return clientPromise;
    };

    return {
        async connect(): Promise<void> {
            const client = await getClient();
            await client.connect();
        },

        async fetchEvents(filter) {
            const client = await getClient();
            return client.fetchEvents(filter);
        },

        async fetchLatestReplaceableEvent(pubkey, kind) {
            const client = await getClient();
            return client.fetchLatestReplaceableEvent(pubkey, kind);
        },
    };
}
