import NDK, { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { getBootstrapRelays, mergeRelaySets, normalizeRelayUrl } from './relay-policy';
import type { DmTransport, PublishResult } from './dm-transport';
import type { NostrEvent, NostrFilter } from './types';

const DEFAULT_CONNECT_TIMEOUT_MS = 4_000;
const DEFAULT_PUBLISH_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_TARGET_RELAYS = 6;

type RelayTier = 'inboxWrite' | 'read' | 'session';

export interface RelayTierSources {
    inboxWrite: string[];
    read: string[];
    session: string[];
}

export interface RelayTierSelection {
    relays: string[];
    tierByRelay: Record<string, RelayTier>;
    hasRecipientRelays: boolean;
}

type RelayPublishOutcome =
    | { status: 'ack' }
    | { status: 'failed'; reason: string }
    | { status: 'timeout' };

interface NdkDmTransportDependencies {
    publishRelay: (relay: string, event: NostrEvent, timeoutMs: number) => Promise<RelayPublishOutcome>;
    subscribe: (filters: NostrFilter[], onEvent: (event: NostrEvent) => void) => (() => void) | void;
    fetchBackfill: (filters: NostrFilter[]) => Promise<NostrEvent[]>;
}

interface CreateNdkDmTransportOptions {
    dependencies?: NdkDmTransportDependencies;
    publishRelay?: NdkDmTransportDependencies['publishRelay'];
    subscribe?: NdkDmTransportDependencies['subscribe'];
    fetchBackfill?: NdkDmTransportDependencies['fetchBackfill'];
    relays?: string[];
    publishTimeoutMs?: number;
    maxTargetRelays?: number;
}

function toNostrEvent(event: unknown): NostrEvent | null {
    if (!event || typeof event !== 'object') {
        return null;
    }

    if (typeof (event as { rawEvent?: unknown }).rawEvent === 'function') {
        return toNostrEvent((event as { rawEvent: () => unknown }).rawEvent());
    }

    const raw = event as {
        id?: unknown;
        pubkey?: unknown;
        kind?: unknown;
        created_at?: unknown;
        tags?: unknown;
        content?: unknown;
    };

    if (
        typeof raw.id !== 'string' ||
        typeof raw.pubkey !== 'string' ||
        typeof raw.kind !== 'number' ||
        typeof raw.created_at !== 'number' ||
        !Array.isArray(raw.tags) ||
        typeof raw.content !== 'string'
    ) {
        return null;
    }

    return {
        id: raw.id,
        pubkey: raw.pubkey,
        kind: raw.kind,
        created_at: raw.created_at,
        tags: raw.tags.filter((tag): tag is string[] => Array.isArray(tag) && tag.every((item) => typeof item === 'string')),
        content: raw.content,
    };
}

function normalizeRelayTargets(relayUrls: string[], maxTargetRelays: number): string[] {
    const targets: string[] = [];
    const seen = new Set<string>();

    for (const relay of relayUrls) {
        const normalized = normalizeRelayUrl(relay);
        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        targets.push(normalized);

        if (targets.length >= maxTargetRelays) {
            break;
        }
    }

    return targets;
}

function normalizeRelayTier(
    urls: string[],
    tier: RelayTier,
    tierByRelay: Record<string, RelayTier>,
    relays: string[],
    maxTargetRelays: number
): void {
    for (const relay of urls) {
        const normalized = normalizeRelayUrl(relay);
        if (!normalized || tierByRelay[normalized]) {
            continue;
        }

        tierByRelay[normalized] = tier;
        relays.push(normalized);

        if (relays.length >= maxTargetRelays) {
            break;
        }
    }
}

function mapPublishFailureReason(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
        return error.message;
    }

    return 'publish-error';
}

function isTimeoutReason(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return /timeout|timed out/i.test(error.message);
}

function createNdkDependencies(relays: string[] = []): NdkDmTransportDependencies {
    const relayUrls = mergeRelaySets(getBootstrapRelays(), relays);
    const ndk = new NDK({ explicitRelayUrls: relayUrls });
    let connectPromise: Promise<void> | null = null;

    async function connect(): Promise<void> {
        if (!connectPromise) {
            connectPromise = ndk.connect(DEFAULT_CONNECT_TIMEOUT_MS).catch((error) => {
                connectPromise = null;
                throw error;
            });
        }

        await connectPromise;
    }

    return {
        async publishRelay(relay, event, timeoutMs) {
            await connect();
            const relaySet = NDKRelaySet.fromRelayUrls([relay], ndk, false);
            const ndkEvent = new NDKEvent(ndk, event as any);

            try {
                const publishedTo = await ndkEvent.publish(relaySet, timeoutMs, 1);
                if (publishedTo.size > 0) {
                    return { status: 'ack' };
                }

                return { status: 'failed', reason: 'no-ack' };
            } catch (error) {
                if (isTimeoutReason(error)) {
                    return { status: 'timeout' };
                }

                return { status: 'failed', reason: mapPublishFailureReason(error) };
            }
        },

        subscribe(filters, onEvent) {
            const subscription = ndk.subscribe(filters as any, {
                closeOnEose: false,
                onEvent(event) {
                    const mapped = toNostrEvent(event);
                    if (mapped) {
                        onEvent(mapped);
                    }
                },
            });

            return () => {
                subscription.stop();
            };
        },

        async fetchBackfill(filters) {
            await connect();
            const events = await ndk.fetchEvents(filters as any);

            return [...events]
                .map((event) => toNostrEvent(event))
                .filter((event): event is NostrEvent => event !== null)
                .sort((a, b) => b.created_at - a.created_at);
        },
    };
}

export function resolveRelayTargetsByTier(
    sources: RelayTierSources,
    maxTargetRelays: number = DEFAULT_MAX_TARGET_RELAYS
): RelayTierSelection {
    const relays: string[] = [];
    const tierByRelay: Record<string, RelayTier> = {};

    normalizeRelayTier(sources.inboxWrite, 'inboxWrite', tierByRelay, relays, maxTargetRelays);
    normalizeRelayTier(sources.read, 'read', tierByRelay, relays, maxTargetRelays);
    normalizeRelayTier(sources.session, 'session', tierByRelay, relays, maxTargetRelays);

    return {
        relays,
        tierByRelay,
        hasRecipientRelays: sources.inboxWrite.length > 0 || sources.read.length > 0,
    };
}

export function isPublishResultSuccessful(result: PublishResult, selection: RelayTierSelection): boolean {
    if (result.ackedRelays.length === 0) {
        return false;
    }

    if (!selection.hasRecipientRelays) {
        return true;
    }

    return result.ackedRelays.some((relay) => {
        const normalized = normalizeRelayUrl(relay);
        if (!normalized) {
            return false;
        }

        const tier = selection.tierByRelay[normalized];
        return tier === 'inboxWrite' || tier === 'read';
    });
}

export function createNdkDmTransport(options: CreateNdkDmTransportOptions = {}): DmTransport {
    const inlineDependencies = options.publishRelay && options.subscribe && options.fetchBackfill
        ? {
            publishRelay: options.publishRelay,
            subscribe: options.subscribe,
            fetchBackfill: options.fetchBackfill,
        }
        : null;

    const dependencies = options.dependencies ?? inlineDependencies ?? createNdkDependencies(options.relays ?? []);
    const publishTimeoutMs = options.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS;
    const maxTargetRelays = options.maxTargetRelays ?? DEFAULT_MAX_TARGET_RELAYS;

    return {
        async publishToRelays(event, relayUrls) {
            const targets = normalizeRelayTargets(relayUrls, maxTargetRelays);
            const result: PublishResult = {
                ackedRelays: [],
                failedRelays: [],
                timeoutRelays: [],
            };

            for (const relay of targets) {
                try {
                    const outcome = await dependencies.publishRelay(relay, event, publishTimeoutMs);

                    if (outcome.status === 'ack') {
                        result.ackedRelays.push(relay);
                    } else if (outcome.status === 'timeout') {
                        result.timeoutRelays.push(relay);
                    } else {
                        result.failedRelays.push({ relay, reason: outcome.reason });
                    }
                } catch (error) {
                    if (isTimeoutReason(error)) {
                        result.timeoutRelays.push(relay);
                    } else {
                        result.failedRelays.push({ relay, reason: mapPublishFailureReason(error) });
                    }
                }
            }

            return result;
        },

        subscribe(filters, onEvent) {
            const stop = dependencies.subscribe(filters, onEvent);
            let closed = false;

            return {
                unsubscribe() {
                    if (closed) {
                        return;
                    }

                    closed = true;
                    if (typeof stop === 'function') {
                        stop();
                    }
                },
            };
        },

        async fetchBackfill(filters) {
            return dependencies.fetchBackfill(filters);
        },
    };
}
