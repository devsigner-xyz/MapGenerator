import type { PublishResult } from '../nostr/dm-types';
import type { NostrEvent } from '../nostr/types';
import { createHttpClient, type HttpClient } from './http-client';

export type RelayScope = 'social' | 'dm';

export interface SignedNostrEvent extends NostrEvent {
    sig: string;
}

export interface PublishForwardInput {
    event: SignedNostrEvent;
    relayScope: RelayScope;
    relays: string[];
}

export interface PublishForwardApi {
    forward(input: PublishForwardInput): Promise<PublishResult>;
}

export interface CreatePublishForwardApiOptions {
    client?: HttpClient;
}

export function createPublishForwardApi(options: CreatePublishForwardApiOptions = {}): PublishForwardApi {
    const client = options.client ?? createHttpClient();

    return {
        async forward(input) {
            return client.postJson<PublishResult>('/publish/forward', {
                includeAuth: true,
                body: {
                    event: input.event,
                    relayScope: input.relayScope,
                    relays: input.relays,
                },
            });
        },
    };
}
