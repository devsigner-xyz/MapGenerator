import { getNostrOverlayQueryTimingProfile } from './query-client';

type QueryRetry = boolean | number | ((failureCount: number, error: unknown) => boolean);
type QueryRetryDelay = number | ((attempt: number, error: unknown) => number);

interface BaseQueryOptions {
    staleTime?: number;
    gcTime?: number;
    retry?: QueryRetry;
    retryDelay?: QueryRetryDelay;
}

interface QueryTimingDefaults {
    staleTime: number;
    gcTime: number;
    retry: QueryRetry;
    retryDelay: QueryRetryDelay;
}

function hasMessage(error: unknown): error is { message: string } {
    return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string';
}

function isRelayError(error: unknown): boolean {
    if (!hasMessage(error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('eose')
        || message.includes('timeout')
        || message.includes('network')
        || message.includes('websocket')
        || message.includes('disconnect');
}

function isRecoverableSocialError(error: unknown): boolean {
    if (!hasMessage(error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    if (message.includes('status 400') || message.includes('status 401') || message.includes('status 403') || message.includes('status 404') || message.includes('invalid')) {
        return false;
    }

    return isRelayError(error) || message.includes('status 429') || message.includes('status 5');
}

function isRecoverableIdentityError(error: unknown): boolean {
    if (!hasMessage(error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    if (message.includes('status 400') || message.includes('status 401') || message.includes('status 403') || message.includes('status 404') || message.includes('invalid')) {
        return false;
    }

    return message.includes('timeout') || message.includes('network') || message.includes('status 429') || message.includes('status 5');
}

function withDomainDefaults<T extends object>(
    options: T,
    defaults: QueryTimingDefaults
): T & BaseQueryOptions {
    const queryOptions = options as T & BaseQueryOptions;
    return {
        ...queryOptions,
        staleTime: queryOptions.staleTime ?? defaults.staleTime,
        gcTime: queryOptions.gcTime ?? defaults.gcTime,
        retry: queryOptions.retry ?? defaults.retry,
        retryDelay: queryOptions.retryDelay ?? defaults.retryDelay,
    };
}

function exponentialBackoffDelay(attempt: number): number {
    const normalizedAttempt = Math.max(1, attempt);
    return Math.min(1_500, 200 * 2 ** (normalizedAttempt - 1));
}

const socialProfile = getNostrOverlayQueryTimingProfile('social');
const metadataProfile = getNostrOverlayQueryTimingProfile('metadata');
const identityProfile = getNostrOverlayQueryTimingProfile('identity');
const realtimeProfile = getNostrOverlayQueryTimingProfile('realtime');

const SOCIAL_DEFAULTS: QueryTimingDefaults = {
    staleTime: socialProfile.staleTime,
    gcTime: socialProfile.gcTime,
    retry: (failureCount, error) => isRecoverableSocialError(error) && failureCount < socialProfile.maxRetries,
    retryDelay: (attempt, error) => (isRecoverableSocialError(error) ? exponentialBackoffDelay(attempt) : 0),
};

const METADATA_DEFAULTS: QueryTimingDefaults = {
    staleTime: metadataProfile.staleTime,
    gcTime: metadataProfile.gcTime,
    retry: (failureCount, error) => isRecoverableSocialError(error) && failureCount < metadataProfile.maxRetries,
    retryDelay: (attempt, error) => (isRecoverableSocialError(error) ? exponentialBackoffDelay(attempt) : 0),
};

const IDENTITY_DEFAULTS: QueryTimingDefaults = {
    staleTime: identityProfile.staleTime,
    gcTime: identityProfile.gcTime,
    retry: (failureCount, error) => isRecoverableIdentityError(error) && failureCount < identityProfile.maxRetries,
    retryDelay: 0,
};

const REALTIME_DEFAULTS: QueryTimingDefaults = {
    staleTime: realtimeProfile.staleTime,
    gcTime: realtimeProfile.gcTime,
    retry: (failureCount) => failureCount < realtimeProfile.maxRetries,
    retryDelay: 0,
};

export function createSocialQueryOptions<T extends object>(options: T): T & BaseQueryOptions {
    return withDomainDefaults(options, SOCIAL_DEFAULTS);
}

export function createMetadataQueryOptions<T extends object>(options: T): T & BaseQueryOptions {
    return withDomainDefaults(options, METADATA_DEFAULTS);
}

export function createIdentityQueryOptions<T extends object>(options: T): T & BaseQueryOptions {
    return withDomainDefaults(options, IDENTITY_DEFAULTS);
}

export function createRealtimeQueryOptions<T extends object>(options: T): T & BaseQueryOptions {
    return withDomainDefaults(options, REALTIME_DEFAULTS);
}
