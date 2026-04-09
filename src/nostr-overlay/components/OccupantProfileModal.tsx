import { useEffect, useRef, useState, type UIEvent } from 'react';
import type { NostrProfile } from '../../nostr/types';
import type { NostrPostPreview } from '../../nostr/posts';
import { ListLoadingFooter } from './ListLoadingFooter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

interface OccupantProfileModalProps {
    pubkey: string;
    profile?: NostrProfile;
    followsCount: number;
    followersCount: number;
    statsLoading: boolean;
    statsError?: string;
    posts: NostrPostPreview[];
    postsLoading: boolean;
    postsError?: string;
    hasMorePosts: boolean;
    follows: string[];
    followers: string[];
    networkProfiles: Record<string, NostrProfile>;
    networkLoading: boolean;
    networkError?: string;
    onLoadMorePosts: () => Promise<void>;
    onClose: () => void;
}

function resolveName(pubkey: string, profile?: NostrProfile): string {
    return profile?.displayName ?? profile?.name ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

const NETWORK_PAGE_SIZE = 20;
const NETWORK_LOAD_DELAY_MS = 120;

export function OccupantProfileModal({
    pubkey,
    profile,
    followsCount,
    followersCount,
    statsLoading,
    statsError,
    posts,
    postsLoading,
    postsError,
    hasMorePosts,
    follows,
    followers,
    networkProfiles,
    networkLoading,
    networkError,
    onLoadMorePosts,
    onClose,
}: OccupantProfileModalProps) {
    const followsTimerRef = useRef<number | null>(null);
    const followersTimerRef = useRef<number | null>(null);
    const [visibleFollowsCount, setVisibleFollowsCount] = useState(() => Math.min(NETWORK_PAGE_SIZE, follows.length));
    const [visibleFollowersCount, setVisibleFollowersCount] = useState(() => Math.min(NETWORK_PAGE_SIZE, followers.length));
    const [followsLoadingMore, setFollowsLoadingMore] = useState(false);
    const [followersLoadingMore, setFollowersLoadingMore] = useState(false);

    const shortPubkey = `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;

    useEffect(() => {
        setVisibleFollowsCount(Math.min(NETWORK_PAGE_SIZE, follows.length));
        setFollowsLoadingMore(false);
        if (followsTimerRef.current !== null) {
            window.clearTimeout(followsTimerRef.current);
            followsTimerRef.current = null;
        }
    }, [follows]);

    useEffect(() => {
        setVisibleFollowersCount(Math.min(NETWORK_PAGE_SIZE, followers.length));
        setFollowersLoadingMore(false);
        if (followersTimerRef.current !== null) {
            window.clearTimeout(followersTimerRef.current);
            followersTimerRef.current = null;
        }
    }, [followers]);

    useEffect(() => {
        return () => {
            if (followsTimerRef.current !== null) {
                window.clearTimeout(followsTimerRef.current);
            }
            if (followersTimerRef.current !== null) {
                window.clearTimeout(followersTimerRef.current);
            }
        };
    }, []);

    const visibleFollows = follows.slice(0, visibleFollowsCount);
    const visibleFollowers = followers.slice(0, visibleFollowersCount);
    const hasMoreFollows = visibleFollowsCount < follows.length;
    const hasMoreFollowers = visibleFollowersCount < followers.length;

    const scheduleLoadMoreFollows = (): void => {
        if (followsLoadingMore || !hasMoreFollows) {
            return;
        }

        setFollowsLoadingMore(true);
        followsTimerRef.current = window.setTimeout(() => {
            setVisibleFollowsCount((current) => Math.min(current + NETWORK_PAGE_SIZE, follows.length));
            setFollowsLoadingMore(false);
            followsTimerRef.current = null;
        }, NETWORK_LOAD_DELAY_MS);
    };

    const scheduleLoadMoreFollowers = (): void => {
        if (followersLoadingMore || !hasMoreFollowers) {
            return;
        }

        setFollowersLoadingMore(true);
        followersTimerRef.current = window.setTimeout(() => {
            setVisibleFollowersCount((current) => Math.min(current + NETWORK_PAGE_SIZE, followers.length));
            setFollowersLoadingMore(false);
            followersTimerRef.current = null;
        }, NETWORK_LOAD_DELAY_MS);
    };

    const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
        const target = event.currentTarget;
        const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 32;
        if (!nearBottom) {
            return;
        }

        if (hasMorePosts && !postsLoading) {
            void onLoadMorePosts();
        }

        if (hasMoreFollows) {
            scheduleLoadMoreFollows();
        }

        if (hasMoreFollowers) {
            scheduleLoadMoreFollowers();
        }
    };

    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent className="nostr-modal nostr-profile-modal" showCloseButton={false} aria-label="Perfil del ocupante">
                <DialogTitle className="sr-only">Perfil del ocupante</DialogTitle>
                <DialogDescription className="sr-only">Datos de red social y publicaciones del ocupante.</DialogDescription>
                <Button type="button" variant="ghost" className="nostr-modal-close" onClick={onClose} aria-label="Cerrar perfil">
                    ×
                </Button>

                <div className="nostr-profile-modal-body" onScroll={handleScroll}>
                    <div className="nostr-modal-header">
                        {profile?.picture ? (
                            <img className="nostr-modal-avatar" src={profile.picture} alt="Avatar del ocupante" />
                        ) : (
                            <div className="nostr-modal-avatar nostr-modal-avatar-fallback" aria-hidden="true">
                                {resolveName(pubkey, profile).slice(0, 2).toUpperCase()}
                            </div>
                        )}

                        <div>
                            <p className="nostr-modal-name">{resolveName(pubkey, profile)}</p>
                            <p className="nostr-modal-pubkey">{shortPubkey}</p>
                        </div>
                    </div>

                    <section className="nostr-profile-metrics">
                        <h4>Red social</h4>
                        {statsLoading ? <p className="nostr-loading">Cargando estadisticas...</p> : null}
                        {statsError ? <p className="nostr-error">{statsError}</p> : null}
                        {networkLoading ? <p className="nostr-loading">Cargando seguidos y seguidores...</p> : null}
                        {networkError ? <p className="nostr-error">{networkError}</p> : null}
                        <dl>
                            <div>
                                <dt>Siguiendo</dt>
                                <dd>{followsCount}</dd>
                            </div>
                            <div>
                                <dt>Seguidores</dt>
                                <dd>{followersCount}</dd>
                            </div>
                        </dl>

                        <div className="nostr-profile-network-columns">
                            <div>
                                <h5>Sigue a</h5>
                                {follows.length === 0 ? <p className="nostr-empty">Sin seguidos visibles.</p> : null}
                                {follows.length > 0 ? (
                                    <ul className="nostr-profile-network-list">
                                        {visibleFollows.map((followPubkey) => (
                                            <li key={followPubkey}>{resolveName(followPubkey, networkProfiles[followPubkey])}</li>
                                        ))}
                                    </ul>
                                ) : null}
                                <ListLoadingFooter loading={followsLoadingMore} />
                            </div>

                            <div>
                                <h5>Le siguen</h5>
                                {followers.length === 0 ? <p className="nostr-empty">Sin seguidores visibles.</p> : null}
                                {followers.length > 0 ? (
                                    <ul className="nostr-profile-network-list">
                                        {visibleFollowers.map((followerPubkey) => (
                                            <li key={followerPubkey}>{resolveName(followerPubkey, networkProfiles[followerPubkey])}</li>
                                        ))}
                                    </ul>
                                ) : null}
                                <ListLoadingFooter loading={followersLoadingMore} />
                            </div>
                        </div>
                    </section>

                    <section className="nostr-profile-posts">
                        <h4>Ultimas publicaciones</h4>

                        {postsError ? <p className="nostr-error">{postsError}</p> : null}

                        {!postsError && posts.length === 0 && !postsLoading ? (
                            <p className="nostr-empty">No hay publicaciones recientes disponibles.</p>
                        ) : null}

                        {posts.length > 0 ? (
                            <ul className="nostr-profile-post-list">
                                {posts.map((post) => (
                                    <li key={post.id} className="nostr-profile-post-item">
                                        <p className="nostr-profile-post-content">{post.content || '(sin contenido textual)'}</p>
                                        <time className="nostr-profile-post-date" dateTime={new Date(post.createdAt * 1000).toISOString()}>
                                            {new Date(post.createdAt * 1000).toLocaleString()}
                                        </time>
                                    </li>
                                ))}
                            </ul>
                        ) : null}

                        {postsLoading ? (
                            <div className="nostr-loading nostr-posts-loading" role="status" aria-live="polite">
                                <Spinner className="nostr-list-loading-spinner" />
                                <span>Cargando publicaciones...</span>
                            </div>
                        ) : null}

                        {hasMorePosts && !postsLoading ? (
                            <Button type="button" className="nostr-submit nostr-posts-load-more" onClick={() => void onLoadMorePosts()}>
                                Cargar mas
                            </Button>
                        ) : null}
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
