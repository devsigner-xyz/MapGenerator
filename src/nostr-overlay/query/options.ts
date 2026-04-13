import { getNostrOverlayQueryTimingProfile } from './query-client';

type QueryRetry = boolean | number | ((failureCount: number, error: unknown) => boolean);
type QueryRetryDelay = number | ((attempt: number, error: unknown) => number);

interface BaseQueryOptions {
    staleTime?: number;
    gcTime?: number;
    retry?: QueryRetry;
    retryDelay?: QueryRetryDelay;
}

type QueryOptionsWithDefaults<T extends BaseQueryOptions> = T & {
    staleTime: number;
    gcTime: number;
    retry: QueryRetry;
    retryDelay: QueryRetryDelay;
};

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
    return message.includes('relay') || message.includes('eose') || message.includes('timeout');
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

function withDomainDefaults<T extends BaseQueryOptions>(
    options: T,
    defaults: QueryTimingDefaults
): QueryOptionsWithDefaults<T> {
    return {
        ...options,
        staleTime: options.staleTime ?? defaults.staleTime,
        gcTime: options.gcTime ?? defaults.gcTime,
        retry: options.retry ?? defaults.retry,
        retryDelay: options.retryDelay ?? defaults.retryDelay,
    };
}

const socialProfile = getNostrOverlayQueryTimingProfile('social');
const metadataProfile = getNostrOverlayQueryTimingProfile('metadata');
const identityProfile = getNostrOverlayQueryTimingProfile('identity');
const realtimeProfile = getNostrOverlayQueryTimingProfile('realtime');

const SOCIAL_DEFAULTS: QueryTimingDefaults = {
    staleTime: socialProfile.staleTime,
    gcTime: socialProfile.gcTime,
    retry: (failureCount, error) => !isRelayError(error) && failureCount < socialProfile.maxRetries,
    retryDelay: 0,
};

const METADATA_DEFAULTS: QueryTimingDefaults = {
    staleTime: metadataProfile.staleTime,
    gcTime: metadataProfile.gcTime,
    retry: (failureCount, error) => !isRelayError(error) && failureCount < metadataProfile.maxRetries,
    retryDelay: 0,
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

export function createSocialQueryOptions<T extends BaseQueryOptions>(options: T): QueryOptionsWithDefaults<T> {
    return withDomainDefaults(options, SOCIAL_DEFAULTS);
}

export function createMetadataQueryOptions<T extends BaseQueryOptions>(options: T): QueryOptionsWithDefaults<T> {
    return withDomainDefaults(options, METADATA_DEFAULTS);
}

export function createIdentityQueryOptions<T extends BaseQueryOptions>(options: T): QueryOptionsWithDefaults<T> {
    return withDomainDefaults(options, IDENTITY_DEFAULTS);
}

export function createRealtimeQueryOptions<T extends BaseQueryOptions>(options: T): QueryOptionsWithDefaults<T> {
    return withDomainDefaults(options, REALTIME_DEFAULTS);
}
