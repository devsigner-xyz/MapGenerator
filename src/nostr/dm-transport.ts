import type { NostrEvent, NostrFilter } from './types';
import type { DmTransportSubscription, PublishResult } from './dm-types';

export interface DmTransport {
    publishToRelays(event: NostrEvent, relayUrls: string[]): Promise<PublishResult>;
    subscribe(filters: NostrFilter[], onEvent: (event: NostrEvent) => void): DmTransportSubscription;
    fetchBackfill(filters: NostrFilter[]): Promise<NostrEvent[]>;
}

export function createNoopDmTransport(): DmTransport {
    return {
        async publishToRelays(_event, relayUrls) {
            return {
                ackedRelays: [],
                failedRelays: relayUrls.map((relay) => ({ relay, reason: 'not-implemented' })),
                timeoutRelays: [],
            };
        },
        subscribe(_filters, _onEvent) {
            return {
                unsubscribe() {
                    return;
                },
            };
        },
        async fetchBackfill(_filters) {
            return [];
        },
    };
}

export type { PublishResult } from './dm-types';
