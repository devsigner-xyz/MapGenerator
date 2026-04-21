import type {
    DirectMessagesConversationQueryInput,
    DirectMessagesListQueryInput,
    EngagementQueryInput,
    FollowingFeedQueryInput,
    NotificationsQueryInput,
    ThreadQueryInput,
} from './types';

const ROOT_SCOPE = 'nostr-overlay' as const;
const SOCIAL_SCOPE = 'social' as const;

function normalizeValues(values: string[]): string[] {
    return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))].sort((left, right) =>
        left.localeCompare(right)
    );
}

function normalizeSearchTerm(term: string): string {
    return term.trim();
}

function normalizeHashtag(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim().replace(/^#+/, '').toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
}

export const nostrOverlayQueryKeys = {
    root: () => [ROOT_SCOPE] as const,
    social: () => [ROOT_SCOPE, SOCIAL_SCOPE] as const,
    followingFeed: (input: FollowingFeedQueryInput) => [
        ROOT_SCOPE,
        SOCIAL_SCOPE,
        'following-feed',
        {
            ownerPubkey: input.ownerPubkey,
            follows: normalizeValues(input.follows),
            hashtag: normalizeHashtag(input.hashtag),
            pageSize: input.pageSize ?? 20,
        },
    ] as const,
    thread: (input: ThreadQueryInput) => [
        ROOT_SCOPE,
        SOCIAL_SCOPE,
        'thread',
        {
            rootEventId: input.rootEventId,
            pageSize: input.pageSize ?? 25,
        },
    ] as const,
    engagement: (input: EngagementQueryInput) => [
        ROOT_SCOPE,
        SOCIAL_SCOPE,
        'engagement',
        {
            eventIds: normalizeValues(input.eventIds),
        },
    ] as const,
    notifications: (input: NotificationsQueryInput) => [
        ROOT_SCOPE,
        SOCIAL_SCOPE,
        'notifications',
        {
            ownerPubkey: input.ownerPubkey,
            limit: input.limit,
            since: input.since,
        },
    ] as const,
    directMessagesList: (input: DirectMessagesListQueryInput) => [
        ROOT_SCOPE,
        SOCIAL_SCOPE,
        'direct-messages',
        'list',
        {
            ownerPubkey: input.ownerPubkey,
        },
    ] as const,
    directMessagesConversation: (input: DirectMessagesConversationQueryInput) => [
        ROOT_SCOPE,
        SOCIAL_SCOPE,
        'direct-messages',
        'conversation',
        {
            ownerPubkey: input.ownerPubkey,
            conversationId: input.conversationId,
        },
    ] as const,
    userSearch: (input: { term: string; ownerPubkey?: string | undefined; searchRelaySetKey?: string | undefined }) => [
        ROOT_SCOPE,
        SOCIAL_SCOPE,
        'search',
        {
            term: normalizeSearchTerm(input.term),
            ownerPubkey: input.ownerPubkey ?? 'anonymous',
            searchRelaySetKey: input.searchRelaySetKey ?? 'default',
        },
    ] as const,
    invalidation: {
        social: () => [ROOT_SCOPE, SOCIAL_SCOPE] as const,
        followingFeed: () => [ROOT_SCOPE, SOCIAL_SCOPE, 'following-feed'] as const,
        notifications: () => [ROOT_SCOPE, SOCIAL_SCOPE, 'notifications'] as const,
        directMessages: () => [ROOT_SCOPE, SOCIAL_SCOPE, 'direct-messages'] as const,
        userSearch: () => [ROOT_SCOPE, SOCIAL_SCOPE, 'search'] as const,
        nip05: () => [ROOT_SCOPE, SOCIAL_SCOPE, 'nip05'] as const,
        relayMetadata: () => [ROOT_SCOPE, SOCIAL_SCOPE, 'relay-metadata'] as const,
        activeProfile: () => [ROOT_SCOPE, SOCIAL_SCOPE, 'active-profile'] as const,
    },
};
