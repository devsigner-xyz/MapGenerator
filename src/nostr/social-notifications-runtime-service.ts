import { createLazyNdkDmTransport } from './lazy-ndk-client';
import { getBootstrapRelays } from './relay-policy';
import { loadRelaySettings } from './relay-settings';
import type {
    SocialNotificationEvent,
    SocialNotificationsService,
} from './social-notifications-service';
import type { DmTransport } from './dm-transport';

const SOCIAL_NOTIFICATION_KINDS = [1, 6, 7, 9735] as const;
const DEFAULT_INITIAL_LIMIT = 120;

interface CreateRuntimeSocialNotificationsServiceOptions {
    createTransport?: (relays: string[]) => DmTransport;
    resolveRelays?: () => string[];
}

function resolveRuntimeSocialRelays(): string[] {
    const settings = loadRelaySettings();
    if (settings.relays.length > 0) {
        return settings.relays;
    }

    return getBootstrapRelays();
}

function normalizeRelaySet(relays: string[]): string[] {
    const set = new Set<string>();
    for (const relay of relays) {
        if (!relay || typeof relay !== 'string') {
            continue;
        }

        set.add(relay);
    }

    return [...set];
}

function isValidSocialNotificationEvent(event: SocialNotificationEvent): boolean {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (typeof event.id !== 'string' || event.id.length === 0) {
        return false;
    }

    if (typeof event.pubkey !== 'string' || event.pubkey.length === 0) {
        return false;
    }

    if (!SOCIAL_NOTIFICATION_KINDS.some((kind) => kind === event.kind)) {
        return false;
    }

    if (!Number.isFinite(event.created_at)) {
        return false;
    }

    if (typeof event.content !== 'string') {
        return false;
    }

    if (!Array.isArray(event.tags)) {
        return false;
    }

    return event.tags.every((tag) => Array.isArray(tag) && tag.every((value) => typeof value === 'string'));
}

function sortAndDedupe(events: SocialNotificationEvent[]): SocialNotificationEvent[] {
    const byId = new Map<string, SocialNotificationEvent>();
    for (const event of events) {
        if (!isValidSocialNotificationEvent(event)) {
            continue;
        }

        byId.set(event.id, event);
    }

    return [...byId.values()].sort((left, right) => {
        if (left.created_at !== right.created_at) {
            return right.created_at - left.created_at;
        }

        return left.id.localeCompare(right.id);
    });
}

export function createRuntimeSocialNotificationsService(
    options: CreateRuntimeSocialNotificationsServiceOptions = {}
): SocialNotificationsService {
    const createTransport = options.createTransport ?? ((relays: string[]) => createLazyNdkDmTransport({ relays }));
    const resolveRelays = options.resolveRelays ?? resolveRuntimeSocialRelays;

    const resolveTransport = (): DmTransport => {
        const relays = normalizeRelaySet(resolveRelays());
        return createTransport(relays);
    };

    return {
        subscribeSocial(input, onEvent) {
            const transport = resolveTransport();
            const subscription = transport.subscribe(
                [{ kinds: [...SOCIAL_NOTIFICATION_KINDS], '#p': [input.ownerPubkey] }],
                (event) => {
                    if (isValidSocialNotificationEvent(event as SocialNotificationEvent)) {
                        onEvent(event as SocialNotificationEvent);
                    }
                }
            );

            return () => {
                subscription.unsubscribe();
            };
        },

        async loadInitialSocial(input) {
            const transport = resolveTransport();
            const limit = Math.max(1, input.limit ?? DEFAULT_INITIAL_LIMIT);
            const events = await transport.fetchBackfill([
                {
                    kinds: [...SOCIAL_NOTIFICATION_KINDS],
                    '#p': [input.ownerPubkey],
                    limit,
                    since: input.since,
                },
            ]);

            return sortAndDedupe(events as SocialNotificationEvent[]).slice(0, limit);
        },
    };
}
