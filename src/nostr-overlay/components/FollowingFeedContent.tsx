import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { SocialEngagementMetrics, SocialFeedItem } from '../../nostr/social-feed-service';
import type { FollowingFeedThreadView } from '../query/following-feed.selectors';
import { fromEmbeddedRepost, fromFeedItem, fromThreadItem } from './note-card-adapters';
import {
    buildFeedActionState,
    buildReplyActionState,
    buildRootActionState,
} from './following-feed-note-card-mappers';
import { ListLoadingFooter } from './ListLoadingFooter';
import { NoteCard } from './NoteCard';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

export interface FollowingFeedViewProps {
    items: SocialFeedItem[];
    hasFollows: boolean;
    profilesByPubkey: Record<string, NostrProfile>;
    engagementByEventId: Record<string, SocialEngagementMetrics>;
    isLoadingFeed: boolean;
    feedError: string | null;
    hasMoreFeed: boolean;
    activeThread: FollowingFeedThreadView | null;
    canWrite: boolean;
    isPublishingPost: boolean;
    isPublishingReply: boolean;
    publishError: string | null;
    reactionByEventId: Record<string, boolean>;
    repostByEventId: Record<string, boolean>;
    pendingReactionByEventId: Record<string, boolean>;
    pendingRepostByEventId: Record<string, boolean>;
    onLoadMoreFeed: () => Promise<void> | void;
    onOpenThread: (rootEventId: string) => Promise<void> | void;
    onCloseThread: () => void;
    onLoadMoreThread: () => Promise<void> | void;
    onPublishPost: (content: string) => Promise<boolean>;
    onPublishReply: (input: {
        targetEventId: string;
        targetPubkey?: string;
        rootEventId?: string;
        content: string;
    }) => Promise<boolean>;
    onToggleReaction: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
    onSelectHashtag?: (hashtag: string) => void;
    onSelectProfile?: (pubkey: string) => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    eventReferencesById?: Record<string, NostrEvent>;
    onCopyNoteId?: (noteId: string) => void;
}

interface FollowingFeedContentProps extends FollowingFeedViewProps {
    className?: string;
    headerActions?: ReactNode;
    headerSubtitle?: string;
    activeHashtag?: string;
}

function shortPubkey(pubkey: string): string {
    if (!pubkey || pubkey.length < 14) {
        return pubkey || 'desconocido';
    }

    return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

interface ParsedEmbeddedRepost {
    id: string;
    pubkey: string;
    createdAt: number;
    kind: number;
    content: string;
    tags: string[][];
}

function parseEmbeddedRepostEvent(content: string): ParsedEmbeddedRepost | null {
    const normalized = content.trim();
    if (!normalized.startsWith('{')) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(normalized);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const eventRecord = parsed as Record<string, unknown>;
        if (
            typeof eventRecord.id !== 'string'
            || typeof eventRecord.pubkey !== 'string'
            || !Number.isFinite(eventRecord.created_at)
            || !Number.isFinite(eventRecord.kind)
            || typeof eventRecord.content !== 'string'
        ) {
            return null;
        }

        return {
            id: eventRecord.id,
            pubkey: eventRecord.pubkey,
            createdAt: Number(eventRecord.created_at),
            kind: Number(eventRecord.kind),
            content: eventRecord.content,
            tags: Array.isArray(eventRecord.tags)
                ? eventRecord.tags
                    .filter((tag): tag is string[] => Array.isArray(tag) && tag.every((entry) => typeof entry === 'string'))
                : [],
        };
    } catch {
        return null;
    }
}

function shouldLoadMore(container: HTMLDivElement): boolean {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom < 80;
}

export function FollowingFeedContent({
    className,
    headerActions,
    headerSubtitle,
    activeHashtag,
    items,
    hasFollows,
    profilesByPubkey,
    engagementByEventId,
    isLoadingFeed,
    feedError,
    hasMoreFeed,
    activeThread,
    canWrite,
    isPublishingPost,
    isPublishingReply,
    publishError,
    reactionByEventId,
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    onLoadMoreFeed,
    onOpenThread,
    onCloseThread,
    onLoadMoreThread,
    onPublishPost,
    onPublishReply,
    onToggleReaction,
    onToggleRepost,
    onSelectHashtag,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
    eventReferencesById,
    onCopyNoteId,
}: FollowingFeedContentProps) {
    const [postDraft, setPostDraft] = useState('');
    const [replyDraft, setReplyDraft] = useState('');
    const [replyTargetEventId, setReplyTargetEventId] = useState<string | null>(null);
    const [replyTargetPubkey, setReplyTargetPubkey] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!activeThread) {
            setReplyDraft('');
            setReplyTargetEventId(null);
            setReplyTargetPubkey(undefined);
            return;
        }

        if (!replyTargetEventId && activeThread.root) {
            setReplyTargetEventId(activeThread.root.id);
            setReplyTargetPubkey(activeThread.root.pubkey);
        }
    }, [activeThread, replyTargetEventId]);

    const onFeedScroll = (container: HTMLDivElement | null): void => {
        if (!container || isLoadingFeed || !hasMoreFeed) {
            return;
        }

        if (shouldLoadMore(container)) {
            void onLoadMoreFeed();
        }
    };

    const onThreadScroll = (container: HTMLDivElement | null): void => {
        if (!container || !activeThread || activeThread.isLoadingMore || !activeThread.hasMore) {
            return;
        }

        if (shouldLoadMore(container)) {
            void onLoadMoreThread();
        }
    };

    const publishDisabled = !canWrite || isPublishingPost;
    const replyDisabled = !canWrite || isPublishingReply || !replyTargetEventId;

    const replyTargetLabel = useMemo(() => {
        if (!replyTargetEventId) {
            return 'Selecciona un mensaje para responder';
        }

        return `Respondiendo al evento ${shortPubkey(replyTargetEventId)}`;
    }, [replyTargetEventId]);

    const resolvedSubtitle = activeThread
        ? 'Respuestas y actividad de la conversación seleccionada.'
        : (headerSubtitle || 'Timeline en tiempo real de personas que sigues');

    return (
        <div className={className || 'nostr-following-feed-dialog'}>
            <div className="nostr-following-feed-header">
                {activeThread ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="nostr-following-feed-back"
                        onClick={onCloseThread}
                    >
                        Volver al Agora
                    </Button>
                ) : null}

                <header className="nostr-page-header nostr-following-feed-page-header">
                    <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">{activeThread ? 'Hilo' : 'Agora'}</h4>
                    <p className="text-sm text-muted-foreground">{resolvedSubtitle}</p>
                </header>

                {headerActions ? (
                    <div className="nostr-following-feed-header-actions">{headerActions}</div>
                ) : null}
            </div>

            {!activeThread ? (
                <>
                    <div className="nostr-following-feed-compose">
                        <Textarea
                            value={postDraft}
                            className="nostr-following-feed-textarea"
                            placeholder="Que estas pensando?"
                            onChange={(event) => setPostDraft(event.target.value)}
                        />
                        <div className="nostr-following-feed-compose-actions">
                            <Button
                                type="button"
                                size="sm"
                                className="nostr-following-feed-publish"
                                disabled={publishDisabled || postDraft.trim().length === 0}
                                onClick={async () => {
                                    const submitted = await onPublishPost(postDraft);
                                    if (submitted) {
                                        setPostDraft('');
                                    }
                                }}
                            >
                                {isPublishingPost ? 'Publicando...' : 'Publicar'}
                            </Button>
                        </div>
                    </div>

                    {feedError ? <p className="nostr-following-feed-error">{feedError}</p> : null}
                    {publishError ? <p className="nostr-following-feed-error">{publishError}</p> : null}

                    <div
                        className="nostr-following-feed-list"
                        onScroll={(event) => onFeedScroll(event.currentTarget)}
                    >
                        {items.length === 0 ? (
                            isLoadingFeed ? (
                                <Empty className="nostr-following-feed-empty">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon">
                                            <Spinner />
                                        </EmptyMedia>
                                        <EmptyTitle>Cargando feed</EmptyTitle>
                                        <EmptyDescription>Buscando publicaciones de personas que sigues.</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            ) : !activeHashtag && !hasFollows ? (
                                <Empty className="nostr-following-feed-empty">
                                    <EmptyHeader>
                                        <EmptyTitle>No sigues a nadie todavia</EmptyTitle>
                                        <EmptyDescription>Empieza a seguir perfiles para ver su actividad en Agora.</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            ) : (
                                <Empty className="nostr-following-feed-empty">
                                    <EmptyHeader>
                                        <EmptyTitle>Sin publicaciones</EmptyTitle>
                                        <EmptyDescription>Todavia no hay notas o reposts para mostrar.</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            )
                        ) : (
                            items.map((item) => {
                                const actionState = buildFeedActionState({
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
                                });

                                const baseNote = fromFeedItem(item, actionState);
                                if (!baseNote) {
                                    return null;
                                }

                                const embeddedRepostPayload = item.kind === 'repost' ? parseEmbeddedRepostEvent(item.content) : null;
                                const embeddedRepostNote = embeddedRepostPayload
                                    ? fromEmbeddedRepost({
                                        id: embeddedRepostPayload.id,
                                        pubkey: embeddedRepostPayload.pubkey,
                                        createdAt: embeddedRepostPayload.createdAt,
                                        content: embeddedRepostPayload.content,
                                        tags: embeddedRepostPayload.tags,
                                    }, 1)
                                    : null;

                                const note = item.kind === 'repost' && embeddedRepostNote
                                    ? {
                                        ...baseNote,
                                        content: '',
                                    }
                                    : baseNote;

                                return (
                                    <div key={item.id} className="grid gap-2">
                                        <NoteCard
                                            note={note}
                                            profilesByPubkey={profilesByPubkey}
                                            onCopyNoteId={onCopyNoteId}
                                            onSelectHashtag={onSelectHashtag}
                                            onSelectProfile={onSelectProfile}
                                            onResolveProfiles={onResolveProfiles}
                                            onSelectEventReference={onSelectEventReference}
                                            onResolveEventReferences={onResolveEventReferences}
                                            eventReferencesById={eventReferencesById}
                                        />
                                        {embeddedRepostNote ? (
                                            <NoteCard
                                                note={embeddedRepostNote}
                                                profilesByPubkey={profilesByPubkey}
                                                onCopyNoteId={onCopyNoteId}
                                                onSelectHashtag={onSelectHashtag}
                                                onSelectProfile={onSelectProfile}
                                                onResolveProfiles={onResolveProfiles}
                                                onSelectEventReference={onSelectEventReference}
                                                onResolveEventReferences={onResolveEventReferences}
                                                eventReferencesById={eventReferencesById}
                                            />
                                        ) : null}
                                    </div>
                                );
                            })
                        )}

                        <ListLoadingFooter loading={isLoadingFeed && items.length > 0} label="Cargando publicaciones..." />

                        {hasMoreFeed && !isLoadingFeed ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="nostr-following-feed-load-more"
                                onClick={() => {
                                    void onLoadMoreFeed();
                                }}
                            >
                                Cargar mas
                            </Button>
                        ) : null}
                    </div>
                </>
            ) : (
                <>
                    {activeThread.error ? <p className="nostr-following-feed-error">{activeThread.error}</p> : null}
                    {publishError ? <p className="nostr-following-feed-error">{publishError}</p> : null}

                    <div
                        className="nostr-following-feed-thread-list"
                        onScroll={(event) => onThreadScroll(event.currentTarget)}
                    >
                        {activeThread.root ? (
                            (() => {
                                const rootActionState = buildRootActionState({
                                    item: activeThread.root,
                                    canWrite,
                                    engagementByEventId,
                                    reactionByEventId,
                                    repostByEventId,
                                    pendingReactionByEventId,
                                    pendingRepostByEventId,
                                    onReply: () => {
                                        setReplyTargetEventId(activeThread.root?.id || null);
                                        setReplyTargetPubkey(activeThread.root?.pubkey);
                                    },
                                    onToggleReaction,
                                    onToggleRepost,
                                });
                                const rootNote = fromThreadItem(activeThread.root, 'root', rootActionState);

                                if (!rootNote) {
                                    return null;
                                }

                                return (
                                    <NoteCard
                                        note={rootNote}
                                        profilesByPubkey={profilesByPubkey}
                                        onCopyNoteId={onCopyNoteId}
                                        onSelectHashtag={onSelectHashtag}
                                        onSelectProfile={onSelectProfile}
                                        onResolveProfiles={onResolveProfiles}
                                        onSelectEventReference={onSelectEventReference}
                                        onResolveEventReferences={onResolveEventReferences}
                                        eventReferencesById={eventReferencesById}
                                    />
                                );
                            })()
                        ) : null}

                        {activeThread.replies.map((reply) => {
                            const replyActionState = buildReplyActionState({
                                item: reply,
                                canWrite,
                                engagementByEventId,
                                reactionByEventId,
                                repostByEventId,
                                pendingReactionByEventId,
                                pendingRepostByEventId,
                                onReply: () => {
                                    setReplyTargetEventId(reply.id);
                                    setReplyTargetPubkey(reply.pubkey);
                                },
                                onToggleReaction,
                                onToggleRepost,
                            });
                            const replyNote = fromThreadItem(reply, 'reply', replyActionState);

                            if (!replyNote) {
                                return null;
                            }

                            return (
                                <NoteCard
                                    key={reply.id}
                                    note={replyNote}
                                    profilesByPubkey={profilesByPubkey}
                                    onCopyNoteId={onCopyNoteId}
                                    onSelectHashtag={onSelectHashtag}
                                    onSelectProfile={onSelectProfile}
                                    onResolveProfiles={onResolveProfiles}
                                    onSelectEventReference={onSelectEventReference}
                                    onResolveEventReferences={onResolveEventReferences}
                                    eventReferencesById={eventReferencesById}
                                />
                            );
                        })}

                        {activeThread.replies.length === 0 && !activeThread.isLoading ? (
                            <Empty className="nostr-following-feed-empty">
                                <EmptyHeader>
                                    <EmptyTitle>Sin respuestas</EmptyTitle>
                                    <EmptyDescription>Aun no hay replies para este hilo.</EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        ) : null}

                        <ListLoadingFooter loading={activeThread.isLoading || activeThread.isLoadingMore} label="Cargando hilo..." />

                        {activeThread.hasMore && !activeThread.isLoadingMore ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="nostr-following-feed-load-more"
                                onClick={() => {
                                    void onLoadMoreThread();
                                }}
                            >
                                Cargar mas respuestas
                            </Button>
                        ) : null}
                    </div>

                    <div className="nostr-following-feed-reply-box">
                        <p className="nostr-following-feed-reply-target">{replyTargetLabel}</p>
                        <Textarea
                            value={replyDraft}
                            className="nostr-following-feed-textarea"
                            placeholder="Escribe tu respuesta"
                            onChange={(event) => setReplyDraft(event.target.value)}
                        />
                        <div className="nostr-following-feed-compose-actions">
                            <Button
                                type="button"
                                size="sm"
                                className="nostr-following-feed-publish"
                                disabled={replyDisabled || replyDraft.trim().length === 0}
                                onClick={async () => {
                                    if (!replyTargetEventId) {
                                        return;
                                    }

                                    const submitted = await onPublishReply({
                                        targetEventId: replyTargetEventId,
                                        targetPubkey: replyTargetPubkey,
                                        rootEventId: activeThread.root?.id,
                                        content: replyDraft,
                                    });
                                    if (submitted) {
                                        setReplyDraft('');
                                    }
                                }}
                            >
                                {isPublishingReply ? 'Enviando...' : 'Responder'}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
