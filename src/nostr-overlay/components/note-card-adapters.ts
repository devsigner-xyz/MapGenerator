import type { NostrPostPreview } from '../../nostr/posts';
import type { SocialFeedItem, SocialThreadItem } from '../../nostr/social-feed-service';
import type { NostrEvent } from '../../nostr/types';
import type { NoteActionState, NoteCardModel } from './note-card-model';
import { kindLabel } from './note-card-model';

interface EmbeddedRepostInput {
    id: string;
    pubkey: string;
    createdAt: number;
    content: string;
    tags: string[][];
}

function hasCriticalFields(input: { id?: string; pubkey?: string; createdAt?: number }): boolean {
    return Boolean(input.id) && Boolean(input.pubkey) && Number.isFinite(input.createdAt);
}

function safeTags(tags: unknown): string[][] {
    if (!Array.isArray(tags)) {
        return [];
    }

    return tags.filter((tag): tag is string[] => Array.isArray(tag) && tag.every((entry) => typeof entry === 'string'));
}

export function fromPostPreview(post: NostrPostPreview, actions?: NoteActionState): NoteCardModel | null {
    if (!hasCriticalFields({ id: post?.id, pubkey: post?.pubkey, createdAt: post?.createdAt })) {
        return null;
    }

    return {
        id: post.id,
        pubkey: post.pubkey,
        createdAt: post.createdAt,
        content: post.content,
        tags: safeTags(post.rawEvent?.tags),
        variant: 'default',
        showCopyId: true,
        nestingLevel: 0,
        ...(actions !== undefined ? { actions } : {}),
    };
}

export function fromFeedItem(item: SocialFeedItem, actions?: NoteActionState): NoteCardModel | null {
    if (!hasCriticalFields({ id: item?.id, pubkey: item?.pubkey, createdAt: item?.createdAt })) {
        return null;
    }

    const label = kindLabel({ variant: 'default', isRepost: item.kind === 'repost' });

    return {
        id: item.id,
        pubkey: item.pubkey,
        createdAt: item.createdAt,
        content: item.content || '',
        tags: safeTags(item.rawEvent?.tags),
        variant: 'default',
        ...(label !== undefined ? { kindLabel: label } : {}),
        showCopyId: true,
        nestingLevel: 0,
        ...(actions !== undefined ? { actions } : {}),
    };
}

export function fromThreadItem(
    item: SocialThreadItem,
    variant: 'root' | 'reply',
    actions?: NoteActionState,
): NoteCardModel | null {
    if (!hasCriticalFields({ id: item?.id, pubkey: item?.pubkey, createdAt: item?.createdAt })) {
        return null;
    }

    const label = kindLabel({ variant });

    return {
        id: item.id,
        pubkey: item.pubkey,
        createdAt: item.createdAt,
        content: item.content || '',
        tags: safeTags(item.rawEvent?.tags),
        variant,
        ...(label !== undefined ? { kindLabel: label } : {}),
        showCopyId: true,
        nestingLevel: 0,
        ...(actions !== undefined ? { actions } : {}),
    };
}

export function fromResolvedReferenceEvent(event: NostrEvent, nestingLevel = 1): NoteCardModel | null {
    if (!hasCriticalFields({ id: event?.id, pubkey: event?.pubkey, createdAt: event?.created_at })) {
        return null;
    }

    return {
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        content: event.content || '',
        tags: safeTags(event.tags),
        variant: 'nested',
        showCopyId: true,
        nestingLevel,
    };
}

export function fromEmbeddedRepost(input: EmbeddedRepostInput, nestingLevel = 1, actions?: NoteActionState): NoteCardModel | null {
    if (!hasCriticalFields({ id: input?.id, pubkey: input?.pubkey, createdAt: input?.createdAt })) {
        return null;
    }

    return {
        id: input.id,
        pubkey: input.pubkey,
        createdAt: input.createdAt,
        content: input.content || '',
        tags: safeTags(input.tags),
        variant: 'nested',
        showCopyId: true,
        nestingLevel,
        ...(actions !== undefined ? { actions } : {}),
    };
}
