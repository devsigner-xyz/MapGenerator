import { useEffect, useRef, useState, type ReactNode, type UIEvent } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import type { NostrPostPreview } from '../../nostr/posts';
import { ListLoadingFooter } from './ListLoadingFooter';
import { Nip05Identifier } from './Nip05Identifier';
import { RichNostrContent } from './RichNostrContent';
import { CircleCheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface OccupantProfileDialogProps {
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
    verification?: Nip05ValidationResult;
    onLoadMorePosts: () => Promise<void>;
    onSelectHashtag?: (hashtag: string) => void;
    onClose: () => void;
}

function resolveName(pubkey: string, profile?: NostrProfile): string {
    return profile?.displayName ?? profile?.name ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

const NETWORK_PAGE_SIZE = 20;
const NETWORK_LOAD_DELAY_MS = 120;
type OccupantProfileTab = 'info' | 'feed' | 'followers' | 'following';

export function OccupantProfileDialog({
    pubkey,
    profile,
    posts,
    postsLoading,
    postsError,
    hasMorePosts,
    follows,
    followers,
    networkProfiles,
    networkLoading,
    networkError,
    verification,
    onLoadMorePosts,
    onSelectHashtag,
    onClose,
}: OccupantProfileDialogProps) {
    const followsTimerRef = useRef<number | null>(null);
    const followersTimerRef = useRef<number | null>(null);
    const [visibleFollowsCount, setVisibleFollowsCount] = useState(() => Math.min(NETWORK_PAGE_SIZE, follows.length));
    const [visibleFollowersCount, setVisibleFollowersCount] = useState(() => Math.min(NETWORK_PAGE_SIZE, followers.length));
    const [followsLoadingMore, setFollowsLoadingMore] = useState(false);
    const [followersLoadingMore, setFollowersLoadingMore] = useState(false);
    const [activeTab, setActiveTab] = useState<OccupantProfileTab>('info');
    const [isAvatarLightboxOpen, setIsAvatarLightboxOpen] = useState(false);
    const isNip05Verified = verification?.status === 'verified';

    let npubLabel = `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
    try {
        const npub = encodeHexToNpub(pubkey);
        npubLabel = `${npub.slice(0, 14)}...${npub.slice(-6)}`;
    } catch {
        npubLabel = `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
    }

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

    const handleTabScroll = (tab: OccupantProfileTab, event: UIEvent<HTMLDivElement>): void => {
        const target = event.currentTarget;
        const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 32;
        if (!nearBottom) {
            return;
        }

        if (tab === 'feed' && hasMorePosts && !postsLoading) {
            void onLoadMorePosts();
        }

        if (tab === 'following' && hasMoreFollows) {
            scheduleLoadMoreFollows();
        }

        if (tab === 'followers' && hasMoreFollowers) {
            scheduleLoadMoreFollowers();
        }
    };

    const infoRows: Array<{ label: string; value: ReactNode }> = [
        {
            label: 'Descripcion',
            value: profile?.about || 'No declarada',
        },
        {
            label: 'NIP-05',
            value: profile?.nip05
                ? <Nip05Identifier profile={profile} verification={verification} />
                : 'No declarado',
        },
        {
            label: 'Sitio web',
            value: profile?.website
                ? (
                    <a href={profile.website} target="_blank" rel="noreferrer noopener" className="nostr-profile-info-link">
                        {profile.website}
                    </a>
                )
                : 'No declarado',
        },
        {
            label: 'LUD16',
            value: profile?.lud16 || 'No declarado',
        },
        {
            label: 'LUD06',
            value: profile?.lud06 || 'No declarado',
        },
        {
            label: 'Bot',
            value: profile?.bot ? 'Si' : 'No',
        },
        {
            label: 'Identidades externas',
            value: profile?.externalIdentities?.length
                ? (
                    <ul className="nostr-profile-identities">
                        {profile.externalIdentities.map((identity) => (
                            <li key={identity}>{identity}</li>
                        ))}
                    </ul>
                )
                : 'No declaradas',
        },
    ];

    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent
                className="nostr-dialog nostr-profile-dialog"
                style={{
                    width: '640px',
                    maxWidth: 'calc(100vw - 32px)',
                }}
                showCloseButton={false}
                aria-label="Perfil del ocupante"
            >
                <DialogTitle className="sr-only">Perfil del ocupante</DialogTitle>
                <DialogDescription className="sr-only">Datos de red social y publicaciones del ocupante.</DialogDescription>
                <Button type="button" variant="ghost" className="nostr-dialog-close" onClick={onClose} aria-label="Cerrar perfil">
                    ×
                </Button>

                <div className="nostr-profile-dialog-body">
                    <div className={`nostr-profile-dialog-banner-shell${profile?.banner ? '' : ' is-placeholder'}`}>
                        {profile?.banner ? <img className="nostr-profile-dialog-banner" src={profile.banner} alt="Banner del perfil" /> : null}
                    </div>

                    <div className="nostr-dialog-header">
                        {profile?.picture ? (
                            <button
                                type="button"
                                className="nostr-dialog-avatar-trigger"
                                aria-label="Ver avatar en grande"
                                onClick={() => setIsAvatarLightboxOpen(true)}
                            >
                                <img className="nostr-dialog-avatar" src={profile.picture} alt="Avatar del ocupante" />
                            </button>
                        ) : (
                            <div className="nostr-dialog-avatar nostr-dialog-avatar-fallback" aria-hidden="true">
                                {resolveName(pubkey, profile).slice(0, 2).toUpperCase()}
                            </div>
                        )}

                        <div>
                            <p className="nostr-dialog-name nostr-identity-row">
                                <span className="truncate">{resolveName(pubkey, profile)}</span>
                                {isNip05Verified ? (
                                    <Badge className="nostr-verified-badge" variant="secondary" title="NIP-05 verificado" aria-label="NIP-05 verificado">
                                        <CircleCheckIcon aria-hidden="true" className="size-3" />
                                    </Badge>
                                ) : null}
                            </p>
                            <p className="nostr-dialog-pubkey">{npubLabel}</p>
                        </div>
                    </div>

                    <Tabs
                        value={activeTab}
                        onValueChange={(value) => setActiveTab(value as OccupantProfileTab)}
                        className="nostr-profile-dialog-tabs"
                        aria-label="Secciones del perfil"
                    >
                        <TabsList variant="line" className="grid h-auto w-full grid-cols-4" aria-label="Secciones del perfil">
                            <TabsTrigger value="info">Sobre mi</TabsTrigger>
                            <TabsTrigger value="feed">Feed</TabsTrigger>
                            <TabsTrigger value="followers">{`Seguidores (${followers.length})`}</TabsTrigger>
                            <TabsTrigger value="following">{`Siguiendo (${follows.length})`}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="info" className="nostr-profile-tab-panel">
                            <div className="nostr-profile-tab-panel-scroll" style={{ scrollbarGutter: 'stable', height: '100%' }}>
                                <section className="nostr-profile-info">
                                    <dl className="nostr-profile-info-list">
                                        {infoRows.map((row) => (
                                            <div key={row.label}>
                                                <dt>{row.label}</dt>
                                                <dd>{row.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </section>
                            </div>
                        </TabsContent>

                        <TabsContent value="feed" className="nostr-profile-tab-panel">
                            <div
                                className="nostr-profile-tab-panel-scroll"
                                style={{ scrollbarGutter: 'stable', height: '100%' }}
                                onScroll={(event) => handleTabScroll('feed', event)}
                            >
                                <section className="nostr-profile-posts">
                                    {postsError ? <p className="nostr-error">{postsError}</p> : null}

                                    {!postsError && posts.length === 0 && !postsLoading ? (
                                        <div className="nostr-profile-posts-empty-state">
                                            <Empty className="nostr-profile-posts-empty">
                                                <EmptyHeader>
                                                    <EmptyTitle>No hay publicaciones recientes disponibles.</EmptyTitle>
                                                </EmptyHeader>
                                            </Empty>
                                        </div>
                                    ) : null}

                                    {posts.length > 0 ? (
                                        <ul className="nostr-profile-post-list">
                                            {posts.map((post) => (
                                                <li key={post.id} className="nostr-profile-post-item">
                                                    <RichNostrContent
                                                        content={post.content || ''}
                                                        onSelectHashtag={onSelectHashtag}
                                                        textClassName="nostr-profile-post-content"
                                                        emptyFallback={<p className="nostr-profile-post-content">(sin contenido textual)</p>}
                                                    />
                                                    <time className="nostr-profile-post-date" dateTime={new Date(post.createdAt * 1000).toISOString()}>
                                                        {new Date(post.createdAt * 1000).toLocaleString()}
                                                    </time>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}

                                    {postsLoading && posts.length === 0 ? (
                                        <Empty className="nostr-profile-posts-empty">
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <Spinner />
                                                </EmptyMedia>
                                                <EmptyTitle>Cargando publicaciones</EmptyTitle>
                                                <EmptyDescription>Estamos consultando las notas del usuario.</EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    ) : null}

                                    {postsLoading && posts.length > 0 ? <ListLoadingFooter loading label="Cargando publicaciones..." /> : null}

                                    {hasMorePosts && !postsLoading ? (
                                        <Button type="button" className="nostr-submit nostr-posts-load-more" onClick={() => void onLoadMorePosts()}>
                                            Cargar mas
                                        </Button>
                                    ) : null}
                                </section>
                            </div>
                        </TabsContent>

                        <TabsContent value="followers" className="nostr-profile-tab-panel">
                            <div
                                className="nostr-profile-tab-panel-scroll"
                                style={{ scrollbarGutter: 'stable', height: '100%' }}
                                onScroll={(event) => handleTabScroll('followers', event)}
                            >
                                <section className="nostr-profile-network-tab">
                                    {networkLoading && followers.length === 0 ? (
                                        <Empty className="nostr-profile-network-empty">
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <Spinner />
                                                </EmptyMedia>
                                                <EmptyTitle>Cargando seguidores</EmptyTitle>
                                                <EmptyDescription>Estamos consultando la red del usuario.</EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    ) : (
                                        <>
                                            {networkError ? <p className="nostr-error">{networkError}</p> : null}
                                            {followers.length === 0 ? (
                                                <div className="nostr-profile-network-empty-state">
                                                    <Empty className="nostr-profile-network-empty">
                                                        <EmptyHeader>
                                                            <EmptyTitle>Sin seguidores visibles.</EmptyTitle>
                                                        </EmptyHeader>
                                                    </Empty>
                                                </div>
                                            ) : null}
                                            {followers.length > 0 ? (
                                                <ul className="nostr-profile-network-list">
                                                    {visibleFollowers.map((followerPubkey) => (
                                                        <li key={followerPubkey}>{resolveName(followerPubkey, networkProfiles[followerPubkey])}</li>
                                                    ))}
                                                </ul>
                                            ) : null}
                                            <ListLoadingFooter loading={followersLoadingMore} />
                                        </>
                                    )}
                                </section>
                            </div>
                        </TabsContent>

                        <TabsContent value="following" className="nostr-profile-tab-panel">
                            <div
                                className="nostr-profile-tab-panel-scroll"
                                style={{ scrollbarGutter: 'stable', height: '100%' }}
                                onScroll={(event) => handleTabScroll('following', event)}
                            >
                                <section className="nostr-profile-network-tab">
                                    {networkLoading && follows.length === 0 ? (
                                        <Empty className="nostr-profile-network-empty">
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <Spinner />
                                                </EmptyMedia>
                                                <EmptyTitle>Cargando seguidos</EmptyTitle>
                                                <EmptyDescription>Estamos consultando la red del usuario.</EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    ) : (
                                        <>
                                            {networkError ? <p className="nostr-error">{networkError}</p> : null}
                                            {follows.length === 0 ? (
                                                <div className="nostr-profile-network-empty-state">
                                                    <Empty className="nostr-profile-network-empty">
                                                        <EmptyHeader>
                                                            <EmptyTitle>Sin seguidos visibles.</EmptyTitle>
                                                        </EmptyHeader>
                                                    </Empty>
                                                </div>
                                            ) : null}
                                            {follows.length > 0 ? (
                                                <ul className="nostr-profile-network-list">
                                                    {visibleFollows.map((followPubkey) => (
                                                        <li key={followPubkey}>{resolveName(followPubkey, networkProfiles[followPubkey])}</li>
                                                    ))}
                                                </ul>
                                            ) : null}
                                            <ListLoadingFooter loading={followsLoadingMore} />
                                        </>
                                    )}
                                </section>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                <Lightbox
                    open={isAvatarLightboxOpen && Boolean(profile?.picture)}
                    close={() => setIsAvatarLightboxOpen(false)}
                    index={0}
                    slides={profile?.picture ? [{ src: profile.picture, alt: `Avatar de ${resolveName(pubkey, profile)}` }] : []}
                    portal={{
                        root: typeof document === 'undefined' ? null : document.body,
                    }}
                    controller={{
                        closeOnBackdropClick: true,
                    }}
                    styles={{
                        root: {
                            zIndex: 2147483000,
                        },
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
