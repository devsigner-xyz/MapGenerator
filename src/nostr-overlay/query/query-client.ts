import { QueryClient } from '@tanstack/react-query';

export const nostrOverlayQueryTimingProfiles = {
    realtime: {
        staleTime: 5_000,
        gcTime: 60_000,
        maxRetries: 0,
    },
    social: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        maxRetries: 2,
    },
    metadata: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        maxRetries: 2,
    },
    identity: {
        staleTime: 15 * 60_000,
        gcTime: 60 * 60_000,
        maxRetries: 0,
    },
} as const;

export type NostrOverlayQueryTimingProfile = keyof typeof nostrOverlayQueryTimingProfiles;

const DEFAULT_PROFILE: NostrOverlayQueryTimingProfile = 'social';

export function getNostrOverlayQueryTimingProfile(profile: NostrOverlayQueryTimingProfile) {
    return nostrOverlayQueryTimingProfiles[profile];
}

let singletonQueryClient: QueryClient | null = null;

function isRelayError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const maybeMessage = 'message' in error ? error.message : undefined;
    const message = typeof maybeMessage === 'string' ? maybeMessage.toLowerCase() : '';
    return message.includes('eose')
        || message.includes('timeout')
        || message.includes('network')
        || message.includes('websocket')
        || message.includes('disconnect')
        || message.includes('status 429')
        || message.includes('status 5');
}

export function createNostrOverlayQueryClient(): QueryClient {
    const profile = getNostrOverlayQueryTimingProfile(DEFAULT_PROFILE);

    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: profile.staleTime,
                gcTime: profile.gcTime,
                retry(failureCount, error) {
                    if (isRelayError(error)) {
                        return failureCount < profile.maxRetries;
                    }

                    return failureCount < profile.maxRetries;
                },
                refetchOnWindowFocus: false,
            },
            mutations: {
                retry: 0,
            },
        },
    });
}

export function getNostrOverlayQueryClient(): QueryClient {
    if (!singletonQueryClient) {
        singletonQueryClient = createNostrOverlayQueryClient();
    }

    return singletonQueryClient;
}
