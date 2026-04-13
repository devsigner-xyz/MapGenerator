import type { QueryKey } from '@tanstack/react-query';

export interface FollowingFeedQueryInput {
    ownerPubkey?: string;
    follows: string[];
    pageSize?: number;
}

export interface ThreadQueryInput {
    rootEventId: string;
    pageSize?: number;
}

export interface EngagementQueryInput {
    eventIds: string[];
}

export interface NotificationsQueryInput {
    ownerPubkey: string;
    limit?: number;
    since?: number;
}

export interface DirectMessagesListQueryInput {
    ownerPubkey: string;
}

export interface DirectMessagesConversationQueryInput {
    ownerPubkey: string;
    conversationId: string;
}

export type NostrOverlayQueryKey = QueryKey & readonly ['nostr-overlay', ...readonly unknown[]];
