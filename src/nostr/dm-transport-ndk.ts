import NDK, { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { normalizeRelayUrl, resolveRelaySetWithBootstrapFallback } from './relay-policy';
import type { DmTransport, PublishResult } from './dm-transport';
import type { NostrEvent, NostrFilter } from './types';

const DEFAULT_CONNECT_TIMEOUT_MS = 4_000;
const DEFAULT_PUBLISH_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_TARGET_RELAYS = 6;
const DEFAULT_PUBLISH_CONCURRENCY = 2;
const CONNECT_RETRY_ATTEMPTS = 3;
const PUBLISH_RETRY_ATTEMPTS = 2;
const BASE_RETRY_DELAY_MS = 200;

type NdkEventInput = ConstructorParameters<typeof NDKEvent>[1];
type NdkSubscribeFilters = Parameters<NDK['subscribe']>[0];
type NdkFetchEventsFilters = Parameters<NDK['fetchEvents']>[0];

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

function isNetworkRecoverableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return /timeout|timed out|network|websocket|relay|eose|disconnected/i.test(error.message);
}

function retryDelayMs(attempt: number): number {
    const baseDelay = BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1);
    const jitter = Math.round(baseDelay * 0.25);
    return Math.min(1_500, baseDelay + jitter);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    shouldRetry: (error: unknown) => boolean
): Promise<T> {
    let attempt = 0;

    while (attempt < maxAttempts) {
        attempt += 1;
        try {
            return await operation();
        } catch (error) {
            if (attempt >= maxAttempts || !shouldRetry(error)) {
                throw error;
            }

            await sleep(retryDelayMs(attempt));
        }
    }

    throw new Error('retry-exhausted');
}

function createNdkDependencies(relays: string[] = []): NdkDmTransportDependencies {
    const relayUrls = resolveRelaySetWithBootstrapFallback(relays);
    const ndk = new NDK({ explicitRelayUrls: relayUrls });
    let connectPromise: Promise<void> | null = null;

    async function connect(): Promise<void> {
        if (!connectPromise) {
            connectPromise = withRetry(
                async () => ndk.connect(DEFAULT_CONNECT_TIMEOUT_MS),
                CONNECT_RETRY_ATTEMPTS,
                isNetworkRecoverableError
            ).catch((error) => {
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
            const ndkEvent = new NDKEvent(ndk, event as unknown as NdkEventInput);

            try {
                const publishedTo = await withRetry(
                    async () => ndkEvent.publish(relaySet, timeoutMs, 1),
                    PUBLISH_RETRY_ATTEMPTS,
                    isNetworkRecoverableError
                );
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
            const subscription = ndk.subscribe(filters as unknown as NdkSubscribeFilters, {
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
            const events = await ndk.fetchEvents(filters as unknown as NdkFetchEventsFilters);

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

            const publishOne = async (relay: string): Promise<void> => {
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
            };

            let nextTargetIndex = 0;
            const workerCount = Math.min(DEFAULT_PUBLISH_CONCURRENCY, targets.length);

            const workers = Array.from({ length: workerCount }, async () => {
                while (nextTargetIndex < targets.length) {
                    const relay = targets[nextTargetIndex];
                    nextTargetIndex += 1;
                    if (!relay) {
                        continue;
                    }
                    await publishOne(relay);
                }
            });

            await Promise.all(workers);

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
            return withRetry(
                async () => dependencies.fetchBackfill(filters),
                CONNECT_RETRY_ATTEMPTS,
                isNetworkRecoverableError
            );
        },
    };
}
