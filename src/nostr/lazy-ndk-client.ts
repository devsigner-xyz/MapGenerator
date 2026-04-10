import type { NostrClient } from './types';
import type { DmTransport } from './dm-transport';

interface NdkModule {
    NdkClient: new (relays?: string[]) => NostrClient;
    createNdkDmTransportClient?: (relays?: string[]) => DmTransport;
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

export function createLazyNdkDmTransport(options: CreateLazyNdkClientOptions = {}): DmTransport {
    const relays = options.relays ?? [];
    const importer = options.importer ?? defaultImporter;
    let transportPromise: Promise<DmTransport> | null = null;

    const getTransport = async (): Promise<DmTransport> => {
        if (!transportPromise) {
            transportPromise = importer().then((mod) => {
                if (!mod.createNdkDmTransportClient) {
                    throw new Error('createNdkDmTransportClient export is required from ndk-client module');
                }

                return mod.createNdkDmTransportClient(relays);
            });
        }

        return transportPromise;
    };

    return {
        async publishToRelays(event, relayUrls) {
            const transport = await getTransport();
            return transport.publishToRelays(event, relayUrls);
        },

        subscribe(filters, onEvent) {
            let subscription: ReturnType<DmTransport['subscribe']> | null = null;
            let closed = false;

            void getTransport().then((transport) => {
                if (closed) {
                    return;
                }

                subscription = transport.subscribe(filters, onEvent);
            });

            return {
                unsubscribe() {
                    closed = true;
                    subscription?.unsubscribe();
                },
            };
        },

        async fetchBackfill(filters) {
            const transport = await getTransport();
            return transport.fetchBackfill(filters);
        },
    };
}
