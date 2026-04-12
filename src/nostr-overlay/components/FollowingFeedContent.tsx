import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SocialFeedItem, SocialThreadItem } from '../../nostr/social-feed-service';
import { ListLoadingFooter } from './ListLoadingFooter';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/textarea';

interface FollowingFeedThreadView {
    rootEventId: string;
    root: SocialThreadItem | null;
    replies: SocialThreadItem[];
    isLoading: boolean;
    isLoadingMore: boolean;
    error: string | null;
    hasMore: boolean;
}

export interface FollowingFeedViewProps {
    items: SocialFeedItem[];
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
    headerKicker?: string;
    headerSubtitle?: string;
}

function shortPubkey(pubkey: string): string {
    if (!pubkey || pubkey.length < 14) {
        return pubkey || 'desconocido';
    }

    return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function previewContent(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 180) {
        return normalized;
    }

    return `${normalized.slice(0, 177)}...`;
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

export function FollowingFeedContent({
    className,
    headerActions,
    headerKicker,
    headerSubtitle,
    items,
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
                        Volver al feed
                    </Button>
                ) : null}
                <div className="nostr-following-feed-header-copy">
                    {headerKicker ? <p className="nostr-following-feed-kicker">{headerKicker}</p> : null}
                    <p className="nostr-following-feed-title">
                        {activeThread ? 'Hilo' : 'Feed siguiendo'}
                    </p>
                    {headerSubtitle ? <p className="nostr-following-feed-subtitle">{headerSubtitle}</p> : null}
                </div>
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
                        {items.length === 0 && !isLoadingFeed ? (
                            <Empty className="nostr-following-feed-empty">
                                <EmptyHeader>
                                    <EmptyTitle>Sin publicaciones</EmptyTitle>
                                    <EmptyDescription>Todavia no hay notas o reposts para mostrar.</EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        ) : (
                            items.map((item) => {
                                const isReactionActive = Boolean(reactionByEventId[item.id]);
                                const isRepostActive = Boolean(repostByEventId[item.id]);
                                const isReactionPending = Boolean(pendingReactionByEventId[item.id]);
                                const isRepostPending = Boolean(pendingRepostByEventId[item.id]);

                                return (
                                    <article key={item.id} className="nostr-following-feed-card">
                                        <div className="nostr-following-feed-card-meta">
                                            <span className="nostr-following-feed-card-kind">{cardLabel(item)}</span>
                                            <span>{shortPubkey(item.pubkey)}</span>
                                        </div>
                                        <p className="nostr-following-feed-card-content">{previewContent(item.content) || '(sin contenido)'}</p>
                                        <div className="nostr-following-feed-card-actions">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    void onOpenThread(item.targetEventId || item.id);
                                                }}
                                            >
                                                Ver hilo
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    void onOpenThread(item.targetEventId || item.id);
                                                }}
                                            >
                                                Responder
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={isReactionActive ? 'default' : 'outline'}
                                                size="sm"
                                                disabled={isReactionPending || !canWrite}
                                                onClick={() => {
                                                    void onToggleReaction({
                                                        eventId: item.id,
                                                        targetPubkey: item.pubkey,
                                                    });
                                                }}
                                            >
                                                {isReactionPending ? '...' : 'Reaccion'}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={isRepostActive ? 'default' : 'outline'}
                                                size="sm"
                                                disabled={isRepostPending || !canWrite}
                                                onClick={() => {
                                                    void onToggleRepost({
                                                        eventId: item.id,
                                                        targetPubkey: item.pubkey,
                                                        repostContent: item.content,
                                                    });
                                                }}
                                            >
                                                {isRepostPending ? '...' : 'Repost'}
                                            </Button>
                                        </div>
                                    </article>
                                );
                            })
                        )}

                        <ListLoadingFooter loading={isLoadingFeed} label="Cargando publicaciones..." />

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
                                <div className="nostr-following-feed-card-meta">
                                    <span className="nostr-following-feed-card-kind">Raiz</span>
                                    <span>{shortPubkey(activeThread.root.pubkey)}</span>
                                </div>
                                <p className="nostr-following-feed-card-content">{previewContent(activeThread.root.content) || '(sin contenido)'}</p>
                                <div className="nostr-following-feed-card-actions">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setReplyTargetEventId(activeThread.root?.id || null);
                                            setReplyTargetPubkey(activeThread.root?.pubkey);
                                        }}
                                    >
                                        Responder raiz
                                    </Button>
                                </div>
                            </article>
                        ) : null}

                        {activeThread.replies.map((reply) => {
                            const isReactionActive = Boolean(reactionByEventId[reply.id]);
                            const isRepostActive = Boolean(repostByEventId[reply.id]);
                            const isReactionPending = Boolean(pendingReactionByEventId[reply.id]);
                            const isRepostPending = Boolean(pendingRepostByEventId[reply.id]);

                            return (
                                <article key={reply.id} className="nostr-following-feed-card">
                                    <div className="nostr-following-feed-card-meta">
                                        <span className="nostr-following-feed-card-kind">Reply</span>
                                        <span>{shortPubkey(reply.pubkey)}</span>
                                    </div>
                                    <p className="nostr-following-feed-card-content">{previewContent(reply.content) || '(sin contenido)'}</p>
                                    <div className="nostr-following-feed-card-actions">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setReplyTargetEventId(reply.id);
                                                setReplyTargetPubkey(reply.pubkey);
                                            }}
                                        >
                                            Responder
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={isReactionActive ? 'default' : 'outline'}
                                            size="sm"
                                            disabled={isReactionPending || !canWrite}
                                            onClick={() => {
                                                void onToggleReaction({
                                                    eventId: reply.id,
                                                    targetPubkey: reply.pubkey,
                                                });
                                            }}
                                        >
                                            {isReactionPending ? '...' : 'Reaccion'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={isRepostActive ? 'default' : 'outline'}
                                            size="sm"
                                            disabled={isRepostPending || !canWrite}
                                            onClick={() => {
                                                void onToggleRepost({
                                                    eventId: reply.id,
                                                    targetPubkey: reply.pubkey,
                                                    repostContent: reply.content,
                                                });
                                            }}
                                        >
                                            {isRepostPending ? '...' : 'Repost'}
                                        </Button>
                                    </div>
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
