import { getBootstrapRelays, mergeRelaySets } from '../nostr/relay-policy';
import { getRelaySetByType, loadRelaySettings } from '../nostr/relay-settings';
import type { PublishResult } from '../nostr/dm-types';
import { createPublishForwardApi, type PublishForwardApi, type SignedNostrEvent } from '../nostr-api/publish-forward-api';
import type { HttpClient } from '../nostr-api/http-client';
import type { PublishEventInput, PublishEventResult, WriteGatewayLike } from './query/following-feed.mutations';

type SignedPublishEventResult = PublishEventResult & { sig: string };
const MAX_SOCIAL_RELAYS = 8;
const ALLOWED_SOCIAL_RELAY_HOSTS = new Set([
    'relay.damus.io',
    'relay.primal.net',
    'nos.lol',
    'relay.nostr.band',
]);

export interface SocialPublisher extends WriteGatewayLike {
    publishEvent(event: PublishEventInput): Promise<SignedPublishEventResult>;
    publishTextNote(content: string, tags?: string[][]): Promise<SignedPublishEventResult>;
}

interface CreateSocialPublisherOptions {
    writeGateway: WriteGatewayLike;
    publishForwardApi?: PublishForwardApi;
    client?: HttpClient;
    resolveOwnerPubkey?: () => string | undefined;
    resolveRelays?: () => string[];
    now?: () => number;
}

function normalizePublishRelays(relays: string[]): string[] {
    const merged = mergeRelaySets(relays);
    const allowed = merged.filter((relay) => {
        try {
            return ALLOWED_SOCIAL_RELAY_HOSTS.has(new URL(relay).hostname);
        } catch {
            return false;
        }
    });
    const resolved = allowed.length > 0
        ? allowed
        : getBootstrapRelays().filter((relay) => {
            try {
                return ALLOWED_SOCIAL_RELAY_HOSTS.has(new URL(relay).hostname);
            } catch {
                return false;
            }
        });
    return resolved.slice(0, MAX_SOCIAL_RELAYS);
}

function defaultResolveRelays(resolveOwnerPubkey?: () => string | undefined): string[] {
    const ownerPubkey = resolveOwnerPubkey?.();
    const relaySettings = loadRelaySettings(ownerPubkey ? { ownerPubkey } : undefined);
    return normalizePublishRelays([
        ...getRelaySetByType(relaySettings, 'nip65Both'),
        ...getRelaySetByType(relaySettings, 'nip65Write'),
    ]);
}

function assertPublishAck(result: PublishResult): void {
    if (result.ackedRelays.length > 0) {
        return;
    }

    throw new Error('No social relays acknowledged the event');
}

function assertSignedEvent(event: PublishEventResult): asserts event is SignedPublishEventResult {
    const sig = (event as Partial<SignedPublishEventResult>).sig;
    if (typeof sig !== 'string' || sig.length === 0) {
        throw new Error('Signed social event is missing sig');
    }
}

export function createSocialPublisher(options: CreateSocialPublisherOptions): SocialPublisher {
    const publishForwardApi = options.publishForwardApi ?? createPublishForwardApi(
        options.client ? { client: options.client } : undefined,
    );
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));

    const resolvePublishRelays = (): string[] => (
        options.resolveRelays
            ? normalizePublishRelays(options.resolveRelays())
            : defaultResolveRelays(options.resolveOwnerPubkey)
    );

    return {
        async publishEvent(event) {
            const signedEvent = await options.writeGateway.publishEvent(event);
            assertSignedEvent(signedEvent);
            const result = await publishForwardApi.forward({
                event: signedEvent as SignedNostrEvent,
                relayScope: 'social',
                relays: resolvePublishRelays(),
            });
            assertPublishAck(result);
            return signedEvent;
        },
        async publishTextNote(content, tags = []) {
            const publishTextNote = options.writeGateway.publishTextNote;
            const signedEvent = publishTextNote
                ? await publishTextNote.call(options.writeGateway, content, tags)
                : await options.writeGateway.publishEvent({
                    kind: 1,
                    content,
                    created_at: now(),
                    tags,
                });
            assertSignedEvent(signedEvent);
            const result = await publishForwardApi.forward({
                event: signedEvent as SignedNostrEvent,
                relayScope: 'social',
                relays: resolvePublishRelays(),
            });
            assertPublishAck(result);
            return signedEvent;
        },
    };
}
