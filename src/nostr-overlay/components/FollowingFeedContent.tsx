import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { HeartIcon, MessageCircleIcon, Repeat2Icon, ZapIcon } from 'lucide-react';
import type { NostrProfile } from '../../nostr/types';
import type { SocialEngagementMetrics, SocialFeedItem, SocialThreadItem } from '../../nostr/social-feed-service';
import type { FollowingFeedThreadView } from '../query/following-feed.selectors';
import { ListLoadingFooter } from './ListLoadingFooter';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

export interface FollowingFeedViewProps {
    items: SocialFeedItem[];
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
}

interface FollowingFeedContentProps extends FollowingFeedViewProps {
    className?: string;
    headerActions?: ReactNode;
    headerSubtitle?: string;
}

const EMPTY_ENGAGEMENT_METRICS: SocialEngagementMetrics = {
    replies: 0,
    reposts: 0,
    reactions: 0,
    zaps: 0,
};

function shortPubkey(pubkey: string): string {
    if (!pubkey || pubkey.length < 14) {
        return pubkey || 'desconocido';
    }

    return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function profileDisplayName(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName ?? profile?.name ?? shortPubkey(pubkey);
}

function profileInitials(pubkey: string, profile: NostrProfile | undefined): string {
    const source = profileDisplayName(pubkey, profile).trim();
    if (!source) {
        return pubkey.slice(0, 2).toUpperCase();
    }

    const words = source.split(/\s+/).filter((part) => part.length > 0);
    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function formatCreatedAt(createdAt: number): { iso: string; label: string } {
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
        return {
            iso: new Date(0).toISOString(),
            label: 'Fecha desconocida',
        };
    }

    const date = new Date(createdAt * 1000);
    return {
        iso: date.toISOString(),
        label: date.toLocaleString(),
    };
}

function previewContent(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 180) {
        return normalized;
    }

    return `${normalized.slice(0, 177)}...`;
}

interface ParsedEmbeddedRepost {
    id: string;
    pubkey: string;
    createdAt: number;
    kind: number;
    content: string;
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
        };
    } catch {
        return null;
    }
}

function cardLabel(item: SocialFeedItem | SocialThreadItem): string {
    if ('kind' in item) {
        return item.kind === 'repost' ? 'Repost' : 'Nota';
    }

    if (item.eventKind === 1) {
        return 'Reply';
    }

    if (item.eventKind === 6 || item.eventKind === 16) {
        return 'Repost';
    }

    return `Kind ${item.eventKind}`;
}

function shouldLoadMore(container: HTMLDivElement): boolean {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom < 80;
}

interface FeedActionBarProps {
    eventId: string;
    pubkey: string;
    repostContent: string;
    canWrite: boolean;
    isReactionActive: boolean;
    isRepostActive: boolean;
    isReactionPending: boolean;
    isRepostPending: boolean;
    metrics: SocialEngagementMetrics;
    onReply: () => void;
    onToggleReaction: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
}

function FeedActionBar({
    eventId,
    pubkey,
    repostContent,
    canWrite,
    isReactionActive,
    isRepostActive,
    isReactionPending,
    isRepostPending,
    metrics,
    onReply,
    onToggleReaction,
    onToggleRepost,
}: FeedActionBarProps) {
    return (
        <div className="nostr-following-feed-card-actions">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="nostr-following-feed-action-button"
                aria-label={`Responder (${metrics.replies})`}
                onClick={onReply}
            >
                <MessageCircleIcon className="nostr-following-feed-action-icon" aria-hidden="true" />
                <span className="nostr-following-feed-action-count">{metrics.replies}</span>
            </Button>

            <Button
                type="button"
                variant={isReactionActive ? 'default' : 'ghost'}
                size="sm"
                className="nostr-following-feed-action-button"
                disabled={isReactionPending || !canWrite}
                aria-label={`Reaccionar (${metrics.reactions})`}
                onClick={() => {
                    void onToggleReaction({
                        eventId,
                        targetPubkey: pubkey,
                    });
                }}
            >
                <HeartIcon className="nostr-following-feed-action-icon" aria-hidden="true" />
                <span className="nostr-following-feed-action-count">{metrics.reactions}</span>
            </Button>

            <Button
                type="button"
                variant={isRepostActive ? 'default' : 'ghost'}
                size="sm"
                className="nostr-following-feed-action-button"
                disabled={isRepostPending || !canWrite}
                aria-label={`Repostear (${metrics.reposts})`}
                onClick={() => {
                    void onToggleRepost({
                        eventId,
                        targetPubkey: pubkey,
                        repostContent,
                    });
                }}
            >
                <Repeat2Icon className="nostr-following-feed-action-icon" aria-hidden="true" />
                <span className="nostr-following-feed-action-count">{metrics.reposts}</span>
            </Button>

            <span className="nostr-following-feed-action-indicator" aria-label={`Zaps recibidos: ${metrics.zaps}`}>
                <ZapIcon className="nostr-following-feed-action-icon" aria-hidden="true" />
                <span className="nostr-following-feed-action-count">{metrics.zaps}</span>
            </span>
        </div>
    );
}

export function FollowingFeedContent({
    className,
    headerActions,
    headerSubtitle,
    items,
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
                    <h3 className="nostr-page-header-inline-title">{activeThread ? 'Hilo' : 'Agora'}</h3>
                    <p>{resolvedSubtitle}</p>
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
                                const isReactionActive = Boolean(reactionByEventId[item.id]);
                                const isRepostActive = Boolean(repostByEventId[item.id]);
                                const isReactionPending = Boolean(pendingReactionByEventId[item.id]);
                                const isRepostPending = Boolean(pendingRepostByEventId[item.id]);
                                const profile = profilesByPubkey[item.pubkey];
                                const authorName = profileDisplayName(item.pubkey, profile);
                                const publishedAt = formatCreatedAt(item.createdAt);
                                const metrics = engagementByEventId[item.id] || EMPTY_ENGAGEMENT_METRICS;
                                const embeddedRepost = item.kind === 'repost' ? parseEmbeddedRepostEvent(item.content) : null;
                                const cardContent = item.kind === 'repost' && embeddedRepost
                                    ? ''
                                    : previewContent(item.content);
                                const embeddedProfile = embeddedRepost ? profilesByPubkey[embeddedRepost.pubkey] : undefined;
                                const embeddedAuthorName = embeddedRepost
                                    ? profileDisplayName(embeddedRepost.pubkey, embeddedProfile)
                                    : '';
                                const embeddedPublishedAt = formatCreatedAt(embeddedRepost?.createdAt ?? 0);

                                return (
                                    <article key={item.id} className="nostr-following-feed-card">
                                        <div className="nostr-following-feed-card-head">
                                            <Avatar className="nostr-following-feed-card-avatar">
                                                {profile?.picture ? <AvatarImage src={profile.picture} alt={authorName} /> : null}
                                                <AvatarFallback>{profileInitials(item.pubkey, profile)}</AvatarFallback>
                                            </Avatar>
                                            <div className="nostr-following-feed-card-head-copy">
                                                <p className="nostr-following-feed-card-author">{authorName}</p>
                                                <p className="nostr-following-feed-card-meta">
                                                    <span className="nostr-following-feed-card-kind">{cardLabel(item)}</span>
                                                    <span>{shortPubkey(item.pubkey)}</span>
                                                    <span>·</span>
                                                    <time dateTime={publishedAt.iso}>{publishedAt.label}</time>
                                                </p>
                                            </div>
                                        </div>
                                        <p className="nostr-following-feed-card-content">{cardContent || (item.kind === 'repost' ? 'Repost sin comentario' : '(sin contenido)')}</p>
                                        {embeddedRepost ? (
                                            <article className="nostr-following-feed-card-embedded" aria-label={`Nota original de ${embeddedAuthorName}`}>
                                                <p className="nostr-following-feed-card-embedded-label">Nota original</p>
                                                <div className="nostr-following-feed-card-head">
                                                    <Avatar className="nostr-following-feed-card-avatar nostr-following-feed-card-embedded-avatar">
                                                        {embeddedProfile?.picture
                                                            ? <AvatarImage src={embeddedProfile.picture} alt={embeddedAuthorName} />
                                                            : null}
                                                        <AvatarFallback>{profileInitials(embeddedRepost.pubkey, embeddedProfile)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="nostr-following-feed-card-head-copy">
                                                        <p className="nostr-following-feed-card-author">{embeddedAuthorName}</p>
                                                        <p className="nostr-following-feed-card-meta">
                                                            <span className="nostr-following-feed-card-kind">Nota</span>
                                                            <span>{shortPubkey(embeddedRepost.pubkey)}</span>
                                                            <span>·</span>
                                                            <time dateTime={embeddedPublishedAt.iso}>{embeddedPublishedAt.label}</time>
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="nostr-following-feed-card-content">{previewContent(embeddedRepost.content) || '(sin contenido)'}</p>
                                            </article>
                                        ) : null}
                                        <FeedActionBar
                                            eventId={item.id}
                                            pubkey={item.pubkey}
                                            repostContent={item.content}
                                            canWrite={canWrite}
                                            isReactionActive={isReactionActive}
                                            isRepostActive={isRepostActive}
                                            isReactionPending={isReactionPending}
                                            isRepostPending={isRepostPending}
                                            metrics={metrics}
                                            onReply={() => {
                                                void onOpenThread(item.targetEventId || item.id);
                                            }}
                                            onToggleReaction={onToggleReaction}
                                            onToggleRepost={onToggleRepost}
                                        />
                                    </article>
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
                            <article className="nostr-following-feed-card nostr-following-feed-card-root">
                                <div className="nostr-following-feed-card-head">
                                    <Avatar className="nostr-following-feed-card-avatar">
                                        {profilesByPubkey[activeThread.root.pubkey]?.picture
                                            ? <AvatarImage src={profilesByPubkey[activeThread.root.pubkey]?.picture} alt={profileDisplayName(activeThread.root.pubkey, profilesByPubkey[activeThread.root.pubkey])} />
                                            : null}
                                        <AvatarFallback>{profileInitials(activeThread.root.pubkey, profilesByPubkey[activeThread.root.pubkey])}</AvatarFallback>
                                    </Avatar>
                                    <div className="nostr-following-feed-card-head-copy">
                                        <p className="nostr-following-feed-card-author">{profileDisplayName(activeThread.root.pubkey, profilesByPubkey[activeThread.root.pubkey])}</p>
                                        <p className="nostr-following-feed-card-meta">
                                            <span className="nostr-following-feed-card-kind">Raiz</span>
                                            <span>{shortPubkey(activeThread.root.pubkey)}</span>
                                            <span>·</span>
                                            <time dateTime={formatCreatedAt(activeThread.root.createdAt).iso}>{formatCreatedAt(activeThread.root.createdAt).label}</time>
                                        </p>
                                    </div>
                                </div>
                                <p className="nostr-following-feed-card-content">{previewContent(activeThread.root.content) || '(sin contenido)'}</p>
                                <FeedActionBar
                                    eventId={activeThread.root.id}
                                    pubkey={activeThread.root.pubkey}
                                    repostContent={activeThread.root.content}
                                    canWrite={canWrite}
                                    isReactionActive={Boolean(reactionByEventId[activeThread.root.id])}
                                    isRepostActive={Boolean(repostByEventId[activeThread.root.id])}
                                    isReactionPending={Boolean(pendingReactionByEventId[activeThread.root.id])}
                                    isRepostPending={Boolean(pendingRepostByEventId[activeThread.root.id])}
                                    metrics={engagementByEventId[activeThread.root.id] || EMPTY_ENGAGEMENT_METRICS}
                                    onReply={() => {
                                        setReplyTargetEventId(activeThread.root?.id || null);
                                        setReplyTargetPubkey(activeThread.root?.pubkey);
                                    }}
                                    onToggleReaction={onToggleReaction}
                                    onToggleRepost={onToggleRepost}
                                />
                            </article>
                        ) : null}

                        {activeThread.replies.map((reply) => {
                            const isReactionActive = Boolean(reactionByEventId[reply.id]);
                            const isRepostActive = Boolean(repostByEventId[reply.id]);
                            const isReactionPending = Boolean(pendingReactionByEventId[reply.id]);
                            const isRepostPending = Boolean(pendingRepostByEventId[reply.id]);

                            return (
                                <article key={reply.id} className="nostr-following-feed-card">
                                    <div className="nostr-following-feed-card-head">
                                        <Avatar className="nostr-following-feed-card-avatar">
                                            {profilesByPubkey[reply.pubkey]?.picture
                                                ? <AvatarImage src={profilesByPubkey[reply.pubkey]?.picture} alt={profileDisplayName(reply.pubkey, profilesByPubkey[reply.pubkey])} />
                                                : null}
                                            <AvatarFallback>{profileInitials(reply.pubkey, profilesByPubkey[reply.pubkey])}</AvatarFallback>
                                        </Avatar>
                                        <div className="nostr-following-feed-card-head-copy">
                                            <p className="nostr-following-feed-card-author">{profileDisplayName(reply.pubkey, profilesByPubkey[reply.pubkey])}</p>
                                            <p className="nostr-following-feed-card-meta">
                                                <span className="nostr-following-feed-card-kind">Reply</span>
                                                <span>{shortPubkey(reply.pubkey)}</span>
                                                <span>·</span>
                                                <time dateTime={formatCreatedAt(reply.createdAt).iso}>{formatCreatedAt(reply.createdAt).label}</time>
                                            </p>
                                        </div>
                                    </div>
                                    <p className="nostr-following-feed-card-content">{previewContent(reply.content) || '(sin contenido)'}</p>
                                    <FeedActionBar
                                        eventId={reply.id}
                                        pubkey={reply.pubkey}
                                        repostContent={reply.content}
                                        canWrite={canWrite}
                                        isReactionActive={isReactionActive}
                                        isRepostActive={isRepostActive}
                                        isReactionPending={isReactionPending}
                                        isRepostPending={isRepostPending}
                                        metrics={engagementByEventId[reply.id] || EMPTY_ENGAGEMENT_METRICS}
                                        onReply={() => {
                                            setReplyTargetEventId(reply.id);
                                            setReplyTargetPubkey(reply.pubkey);
                                        }}
                                        onToggleReaction={onToggleReaction}
                                        onToggleRepost={onToggleRepost}
                                    />
                                </article>
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
