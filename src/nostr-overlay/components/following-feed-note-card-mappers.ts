import type { SocialEngagementMetrics, SocialFeedItem, SocialThreadItem } from '../../nostr/social-feed-service';
import type { NoteActionState } from './note-card-model';

const EMPTY_ENGAGEMENT_METRICS: SocialEngagementMetrics = {
    replies: 0,
    reposts: 0,
    reactions: 0,
    zaps: 0,
    zapSats: 0,
};

interface BuildActionStateBaseInput {
    canWrite: boolean;
    engagementByEventId: Record<string, SocialEngagementMetrics>;
    reactionByEventId: Record<string, boolean>;
    repostByEventId: Record<string, boolean>;
    pendingReactionByEventId: Record<string, boolean>;
    pendingRepostByEventId: Record<string, boolean>;
    onToggleReaction: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
}

interface BuildFeedActionStateInput extends BuildActionStateBaseInput {
    item: SocialFeedItem;
    onOpenThread: (rootEventId: string) => Promise<void> | void;
}

interface BuildThreadActionStateInput extends BuildActionStateBaseInput {
    item: SocialThreadItem;
    onReply: () => void;
}

function metricsForEvent(
    engagementByEventId: Record<string, SocialEngagementMetrics>,
    eventId: string,
): SocialEngagementMetrics {
    return engagementByEventId[eventId] ?? EMPTY_ENGAGEMENT_METRICS;
}

export function buildFeedActionState({
    item,
    canWrite,
    engagementByEventId,
    reactionByEventId,
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    onOpenThread,
    onToggleReaction,
    onToggleRepost,
}: BuildFeedActionStateInput): NoteActionState {
    const metrics = metricsForEvent(engagementByEventId, item.id);

    return {
        canWrite,
        isReactionActive: Boolean(reactionByEventId[item.id]),
        isRepostActive: Boolean(repostByEventId[item.id]),
        isReactionPending: Boolean(pendingReactionByEventId[item.id]),
        isRepostPending: Boolean(pendingRepostByEventId[item.id]),
        replies: metrics.replies,
        reactions: metrics.reactions,
        reposts: metrics.reposts,
        zapSats: metrics.zapSats,
        onReply: () => {
            void onOpenThread(item.targetEventId || item.id);
        },
        onToggleReaction: () => onToggleReaction({
            eventId: item.id,
            targetPubkey: item.pubkey,
        }),
        onToggleRepost: () => onToggleRepost({
            eventId: item.id,
            targetPubkey: item.pubkey,
            repostContent: item.content,
        }),
    };
}

export function buildRootActionState({
    item,
    canWrite,
    engagementByEventId,
    reactionByEventId,
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    onReply,
    onToggleReaction,
    onToggleRepost,
}: BuildThreadActionStateInput): NoteActionState {
    const metrics = metricsForEvent(engagementByEventId, item.id);

    return {
        canWrite,
        isReactionActive: Boolean(reactionByEventId[item.id]),
        isRepostActive: Boolean(repostByEventId[item.id]),
        isReactionPending: Boolean(pendingReactionByEventId[item.id]),
        isRepostPending: Boolean(pendingRepostByEventId[item.id]),
        replies: metrics.replies,
        reactions: metrics.reactions,
        reposts: metrics.reposts,
        zapSats: metrics.zapSats,
        onReply,
        onToggleReaction: () => onToggleReaction({
            eventId: item.id,
            targetPubkey: item.pubkey,
        }),
        onToggleRepost: () => onToggleRepost({
            eventId: item.id,
            targetPubkey: item.pubkey,
            repostContent: item.content,
        }),
    };
}

export function buildReplyActionState(input: BuildThreadActionStateInput): NoteActionState {
    return buildRootActionState(input);
}
