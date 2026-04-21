import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type UIEvent } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import { encodeHexToNpub } from '../../nostr/npub';
import { RELAY_TYPES, type RelaySettingsByType, type RelayType } from '../../nostr/relay-settings';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { NostrPostPreview } from '../../nostr/posts';
import { ListLoadingFooter } from './ListLoadingFooter';
import { NoteCard } from './NoteCard';
import { buildPreviewActionState } from './following-feed-note-card-mappers';
import { Nip05Identifier } from './Nip05Identifier';
import { fromPostPreview } from './note-card-adapters';
import type { NoteCardModel } from './note-card-model';
import { withoutNoteActions } from './note-card-model';
import { CircleCheckIcon, CopyIcon, EllipsisVerticalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { PersonContextMenuItems } from './PersonContextMenuItems';
import { toast } from 'sonner';
import type { SocialEngagementMetrics } from '../../nostr/social-feed-service';

interface OccupantProfileDialogProps {
    ownerPubkey?: string;
    pubkey: string;
    profile?: NostrProfile;
    followsCount: number;
    followersCount: number;
    statsLoading: boolean;
    statsError?: string;
    posts: NostrPostPreview[];
    engagementByEventId?: Record<string, SocialEngagementMetrics>;
    postsLoading: boolean;
    postsError?: string;
    hasMorePosts: boolean;
    follows: string[];
    followers: string[];
    networkProfiles: Record<string, NostrProfile>;
    profilesByPubkey?: Record<string, NostrProfile>;
    networkLoading: boolean;
    networkError?: string;
    verification?: Nip05ValidationResult;
    onLoadMorePosts: () => Promise<void>;
    onSelectHashtag?: (hashtag: string) => void;
    onSelectProfile?: (pubkey: string) => void;
    onCopyNpub?: (value: string) => void | Promise<void>;
    ownerFollows?: string[];
    onFollowProfile?: (pubkey: string) => void | Promise<void>;
    onSendMessage?: (pubkey: string) => void | Promise<void>;
    canWrite?: boolean;
    reactionByEventId?: Record<string, boolean>;
    repostByEventId?: Record<string, boolean>;
    pendingReactionByEventId?: Record<string, boolean>;
    pendingRepostByEventId?: Record<string, boolean>;
    relaySuggestionsByType?: RelaySettingsByType;
    onOpenThread?: (eventId: string) => void | Promise<void>;
    onAddRelaySuggestion?: (relayUrl: string, relayTypes: RelayType[]) => void | Promise<void>;
    onAddAllRelaySuggestions?: (rows: Array<{ relayUrl: string; relayTypes: RelayType[] }>) => void | Promise<void>;
    onToggleReaction?: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost?: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
    onOpenQuoteComposer?: (note: NoteCardModel) => void;
    onZap?: (input: { eventId: string; eventKind?: number; targetPubkey?: string; amount: number }) => Promise<void> | void;
    zapAmounts?: number[];
    onConfigureZapAmounts?: () => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    eventReferencesById?: Record<string, NostrEvent>;
    onClose: () => void;
}

function resolveName(pubkey: string, profile?: NostrProfile): string {
    return profile?.displayName ?? profile?.name ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

function resolveInitials(pubkey: string, profile?: NostrProfile): string {
    const name = resolveName(pubkey, profile).trim();
    if (!name) {
        return pubkey.slice(0, 2).toUpperCase();
    }

    const parts = name.split(/\s+/).filter((part) => part.length > 0);
    if (parts.length === 1) {
        return (parts[0] ?? '').slice(0, 2).toUpperCase();
    }

    return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

function pubkeyToNpub(pubkey: string): string {
    try {
        return encodeHexToNpub(pubkey);
    } catch {
        return pubkey;
    }
}

function truncateIdentifier(identifier: string): string {
    if (identifier.length <= 22) {
        return identifier;
    }

    return `${identifier.slice(0, 14)}...${identifier.slice(-6)}`;
}

const NETWORK_PAGE_SIZE = 20;
const NETWORK_LOAD_DELAY_MS = 120;
type OccupantProfileTab = 'info' | 'feed' | 'followers' | 'following';

const RELAY_TYPE_LABELS: Record<RelayType, string> = {
    nip65Both: 'NIP-65 read+write',
    nip65Read: 'NIP-65 read',
    nip65Write: 'NIP-65 write',
    dmInbox: 'NIP-17 DM inbox',
};

function buildRelaySuggestionRows(relaySuggestionsByType?: RelaySettingsByType): Array<{ relayUrl: string; relayTypes: RelayType[] }> {
    if (!relaySuggestionsByType) {
        return [];
    }

    const relayTypesByUrl = new Map<string, Set<RelayType>>();
    for (const relayType of RELAY_TYPES) {
        const relaySet = relaySuggestionsByType[relayType] ?? [];
        for (const relayUrl of relaySet) {
            const current = relayTypesByUrl.get(relayUrl) ?? new Set<RelayType>();
            current.add(relayType);
            relayTypesByUrl.set(relayUrl, current);
        }
    }

    return [...relayTypesByUrl.entries()]
        .map(([relayUrl, relayTypesSet]) => ({
            relayUrl,
            relayTypes: RELAY_TYPES.filter((relayType) => relayTypesSet.has(relayType)),
        }))
        .sort((left, right) => left.relayUrl.localeCompare(right.relayUrl));
}

export function OccupantProfileDialog({
    ownerPubkey,
    pubkey,
    profile,
    posts,
    engagementByEventId = {},
    postsLoading,
    postsError,
    hasMorePosts,
    follows,
    followers,
    networkProfiles,
    profilesByPubkey,
    networkLoading,
    networkError,
    verification,
    onLoadMorePosts,
    onSelectHashtag,
    onSelectProfile,
    onCopyNpub,
    ownerFollows = [],
    onFollowProfile,
    onSendMessage,
    canWrite = false,
    reactionByEventId = {},
    repostByEventId = {},
    pendingReactionByEventId = {},
    pendingRepostByEventId = {},
    relaySuggestionsByType,
    onOpenThread,
    onAddRelaySuggestion,
    onAddAllRelaySuggestions,
    onToggleReaction,
    onToggleRepost,
    onOpenQuoteComposer,
    onZap,
    zapAmounts = [21, 128, 256],
    onConfigureZapAmounts,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
    eventReferencesById,
    onClose,
}: OccupantProfileDialogProps) {
    const followsTimerRef = useRef<number | null>(null);
    const followersTimerRef = useRef<number | null>(null);
    const [visibleFollowsCount, setVisibleFollowsCount] = useState(() => Math.min(NETWORK_PAGE_SIZE, follows.length));
    const [visibleFollowersCount, setVisibleFollowersCount] = useState(() => Math.min(NETWORK_PAGE_SIZE, followers.length));
    const [followsLoadingMore, setFollowsLoadingMore] = useState(false);
    const [followersLoadingMore, setFollowersLoadingMore] = useState(false);
    const [pendingFollowByPubkey, setPendingFollowByPubkey] = useState<Record<string, boolean>>({});
    const [activeTab, setActiveTab] = useState<OccupantProfileTab>('info');
    const [isAvatarLightboxOpen, setIsAvatarLightboxOpen] = useState(false);
    const ownerFollowSet = useMemo(() => new Set(ownerFollows), [ownerFollows]);
    const isNip05Verified = verification?.status === 'verified';
    const displayName = resolveName(pubkey, profile);
    const relaySuggestionRows = useMemo(
        () => buildRelaySuggestionRows(relaySuggestionsByType),
        [relaySuggestionsByType]
    );
    const canAddRelaySuggestions = typeof onAddRelaySuggestion === 'function';
    const canAddAllRelaySuggestions = typeof onAddAllRelaySuggestions === 'function' && relaySuggestionRows.length > 1;

    const npubValue = useMemo(() => {
        try {
            return encodeHexToNpub(pubkey);
        } catch {
            return pubkey;
        }
    }, [pubkey]);
    const npubLabel = npubValue.startsWith('npub1')
        ? `${npubValue.slice(0, 14)}...${npubValue.slice(-6)}`
        : `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;

    const copyNpubToClipboard = async (): Promise<void> => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(npubValue);
            toast.success('npub copiada', { duration: 1600 });
        } catch {
            return;
        }
    };

    const copyNoteIdToClipboard = async (noteId: string): Promise<void> => {
        if (!noteId || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(noteId);
            toast.success('ID de nota copiado', { duration: 1600 });
        } catch {
            return;
        }
    };

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

    const followProfile = (targetPubkey: string): void => {
        if (typeof onFollowProfile !== 'function') {
            return;
        }

        setPendingFollowByPubkey((current) => ({
            ...current,
            [targetPubkey]: true,
        }));

        void Promise.resolve(onFollowProfile(targetPubkey))
            .catch((): void => undefined)
            .finally((): void => {
                setPendingFollowByPubkey((current) => {
                    if (!current[targetPubkey]) {
                        return current;
                    }

                    const next = { ...current };
                    delete next[targetPubkey];
                    return next;
                });
        });
    };

    const openPersonActionsMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    const addRelaySuggestion = (relayUrl: string, relayTypes: RelayType[]): void => {
        if (typeof onAddRelaySuggestion !== 'function' || relayTypes.length === 0) {
            return;
        }

        void Promise.resolve(onAddRelaySuggestion(relayUrl, relayTypes));
    };

    const addAllRelaySuggestions = (): void => {
        if (typeof onAddAllRelaySuggestions !== 'function' || relaySuggestionRows.length === 0) {
            return;
        }

        void Promise.resolve(onAddAllRelaySuggestions(relaySuggestionRows));
    };

    const infoRows: Array<{ label: string; value: ReactNode }> = [
        {
            label: 'Descripcion',
            value: profile?.about || 'No declarada',
        },
        {
            label: 'NIP-05',
            value: profile?.nip05
                ? (
                    <Nip05Identifier
                        {...(profile ? { profile } : {})}
                        {...(verification ? { verification } : {})}
                    />
                )
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

    const renderNetworkPersonItem = (personPubkey: string) => {
        const personProfile = networkProfiles[personPubkey];
        const personDisplay = resolveName(personPubkey, personProfile);
        const personNpub = pubkeyToNpub(personPubkey);
        const personNpubLabel = personNpub.startsWith('npub1')
            ? truncateIdentifier(personNpub)
            : `${personPubkey.slice(0, 8)}...${personPubkey.slice(-6)}`;
        const selectable = typeof onSelectProfile === 'function';
        const canFollow = typeof onFollowProfile === 'function' && ownerPubkey !== personPubkey;
        const canCopy = typeof onCopyNpub === 'function';
        const canSendMessage = typeof onSendMessage === 'function' && ownerPubkey !== personPubkey;
        const canViewDetails = typeof onSelectProfile === 'function';
        const isFollowed = ownerFollowSet.has(personPubkey);
        const isFollowPending = Boolean(pendingFollowByPubkey[personPubkey]);
        const followDisabled = isFollowed || isFollowPending;
        const followLabel = followDisabled ? 'Siguiendo' : 'Seguir';
        const followAriaLabel = followDisabled ? `Ya sigues a ${personDisplay}` : `Seguir a ${personDisplay}`;

        const contextMenuActionProps = {
            ...(canCopy ? { onCopyNpub: () => onCopyNpub?.(pubkeyToNpub(personPubkey)) } : {}),
            ...(canSendMessage ? { onSendMessage: () => onSendMessage?.(personPubkey) } : {}),
            ...(canViewDetails ? { onViewDetails: () => onSelectProfile?.(personPubkey) } : {}),
            testIdPrefix: `profile-network-${personPubkey}`,
        };

        const personContent = (
            <>
                <ItemMedia>
                    <Avatar className="size-9">
                        {personProfile?.picture ? (
                            <AvatarImage src={personProfile.picture} alt={personDisplay} />
                        ) : null}
                        <AvatarFallback>{resolveInitials(personPubkey, personProfile)}</AvatarFallback>
                    </Avatar>
                </ItemMedia>
                <ItemContent className="min-w-0">
                    <ItemTitle>
                        <span className="truncate">{personDisplay}</span>
                    </ItemTitle>
                    <ItemDescription className="truncate">{personNpubLabel}</ItemDescription>
                </ItemContent>
            </>
        );

        return (
            <Item variant="outline" size="sm" className="gap-2">
                {selectable ? (
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left outline-none"
                        onClick={() => onSelectProfile?.(personPubkey)}
                    >
                        {personContent}
                    </button>
                ) : personContent}

                {canFollow ? (
                    <Button
                        type="button"
                        size="xs"
                        variant={followDisabled ? 'secondary' : 'outline'}
                        className="shrink-0"
                        disabled={followDisabled}
                        aria-label={followAriaLabel}
                        onClick={() => followProfile(personPubkey)}
                    >
                        {followLabel}
                    </Button>
                ) : null}

                {(canCopy || canSendMessage || canViewDetails) ? (
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                className="shrink-0"
                                aria-label={`Abrir acciones para ${personDisplay}`}
                                onClick={openPersonActionsMenu}
                            >
                                <EllipsisVerticalIcon data-icon="inline-start" />
                            </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                            <ContextMenuGroup>
                                <PersonContextMenuItems {...contextMenuActionProps} />
                            </ContextMenuGroup>
                        </ContextMenuContent>
                    </ContextMenu>
                ) : null}
            </Item>
        );
    };
    const noteCardSharedProps = {
        ...(onSelectHashtag ? { onSelectHashtag } : {}),
        ...(onSelectProfile ? { onSelectProfile } : {}),
        ...(onResolveProfiles ? { onResolveProfiles } : {}),
        ...(onSelectEventReference ? { onSelectEventReference } : {}),
        ...(onResolveEventReferences ? { onResolveEventReferences } : {}),
        ...(eventReferencesById ? { eventReferencesById } : {}),
    };
    const canRenderPostActions = typeof onOpenThread === 'function' && typeof onToggleReaction === 'function' && typeof onToggleRepost === 'function' && typeof onZap === 'function';

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

                    <div className="nostr-dialog-header flex items-start gap-4">
                        {profile?.picture ? (
                            <button
                                type="button"
                                className="nostr-dialog-avatar-trigger overflow-hidden rounded-full"
                                aria-label="Ver avatar en grande"
                                onClick={() => setIsAvatarLightboxOpen(true)}
                            >
                                <Avatar className="size-12 border border-border/70 shadow-xs">
                                    <AvatarImage src={profile.picture} alt="Avatar del ocupante" />
                                    <AvatarFallback className="bg-muted text-muted-foreground">
                                        {resolveInitials(pubkey, profile)}
                                    </AvatarFallback>
                                </Avatar>
                            </button>
                        ) : (
                            <Avatar className="size-12 border border-border/70 shadow-xs" aria-hidden="true">
                                <AvatarFallback className="bg-muted text-muted-foreground">
                                    {resolveInitials(pubkey, profile)}
                                </AvatarFallback>
                            </Avatar>
                        )}

                        <div className="min-w-0 space-y-1">
                            <p className="nostr-dialog-name nostr-identity-row inline-flex max-w-full items-center gap-2 text-base font-semibold text-foreground">
                                <span className="truncate">{resolveName(pubkey, profile)}</span>
                                {isNip05Verified ? (
                                    <Badge className="nostr-verified-badge" variant="secondary" title="NIP-05 verificado" aria-label="NIP-05 verificado">
                                        <CircleCheckIcon aria-hidden="true" className="size-3" />
                                    </Badge>
                                ) : null}
                            </p>
                            <div className="nostr-dialog-pubkey-row flex items-center gap-1">
                                <p className="nostr-dialog-pubkey truncate text-sm text-muted-foreground">{npubLabel}</p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="nostr-dialog-copy-npub shrink-0"
                                    aria-label="Copiar npub"
                                    title="Copiar npub"
                                    onClick={() => {
                                        void copyNpubToClipboard();
                                    }}
                                >
                                    <CopyIcon data-icon="inline-start" aria-hidden="true" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    <Tabs
                        value={activeTab}
                        onValueChange={(value) => setActiveTab(value as OccupantProfileTab)}
                        className="nostr-profile-dialog-tabs"
                        aria-label="Secciones del perfil"
                    >
                        <TabsList variant="line" className="grid h-auto w-full grid-cols-4" aria-label="Secciones del perfil">
                            <TabsTrigger value="info">Información</TabsTrigger>
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

                                    <section>
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <h5 className="text-sm font-semibold">Relays declarados</h5>
                                            {canAddAllRelaySuggestions ? (
                                                <Button
                                                    type="button"
                                                    size="xs"
                                                    variant="outline"
                                                    aria-label="Añadir todos los relays declarados"
                                                    onClick={addAllRelaySuggestions}
                                                >
                                                    Añadir todos
                                                </Button>
                                            ) : null}
                                        </div>

                                        {relaySuggestionRows.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">Sin relays declarados por este perfil.</p>
                                        ) : (
                                            <ItemGroup className="nostr-profile-network-list">
                                                {relaySuggestionRows.map((relayRow) => (
                                                    <div key={relayRow.relayUrl} className="nostr-profile-network-item-wrap">
                                                        <Item variant="outline" size="sm" className="gap-2">
                                                            <ItemContent className="min-w-0 flex-1">
                                                                <ItemTitle>
                                                                    <span className="truncate">{relayRow.relayUrl}</span>
                                                                </ItemTitle>
                                                                <ItemDescription>
                                                                    <span className="nostr-relay-nip-badges">
                                                                        {relayRow.relayTypes.map((relayType) => (
                                                                            <Badge key={`${relayRow.relayUrl}-${relayType}`} variant="outline">
                                                                                {RELAY_TYPE_LABELS[relayType]}
                                                                            </Badge>
                                                                        ))}
                                                                    </span>
                                                                </ItemDescription>
                                                            </ItemContent>

                                                            {canAddRelaySuggestions ? (
                                                                <Button
                                                                    type="button"
                                                                    size="xs"
                                                                    variant="outline"
                                                                    className="shrink-0"
                                                                    aria-label={`Añadir relay ${relayRow.relayUrl}`}
                                                                    onClick={() => addRelaySuggestion(relayRow.relayUrl, relayRow.relayTypes)}
                                                                >
                                                                    Añadir
                                                                </Button>
                                                            ) : null}
                                                        </Item>
                                                    </div>
                                                ))}
                                            </ItemGroup>
                                        )}
                                    </section>
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
                                        <div className="nostr-profile-post-list px-1 pt-1" data-testid="profile-post-list">
                                            {posts.map((post) => {
                                                const actionState = canRenderPostActions
                                                    ? buildPreviewActionState({
                                                        item: post,
                                                        canWrite,
                                                        engagementByEventId,
                                                        reactionByEventId,
                                                        repostByEventId,
                                                        pendingReactionByEventId,
                                                        pendingRepostByEventId,
                                                        onOpenThread,
                                                        onToggleReaction,
                                                        onToggleRepost,
                                                        onQuote: () => {},
                                                        onZap,
                                                        zapAmounts,
                                                        ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
                                                    })
                                                    : undefined;
                                                const note = fromPostPreview(post, actionState);
                                                if (!note) {
                                                    return (
                                                        <article key={post.id}>
                                                            <p>No se pudo renderizar la nota.</p>
                                                        </article>
                                                    );
                                                }

                                                if (note.actions && onOpenQuoteComposer) {
                                                    note.actions.onQuote = () => onOpenQuoteComposer(withoutNoteActions(note));
                                                }

                                                return (
                                                    <NoteCard
                                                        key={post.id}
                                                        note={note}
                                                        profilesByPubkey={profilesByPubkey || {}}
                                                        onCopyNoteId={copyNoteIdToClipboard}
                                                        {...noteCardSharedProps}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ) : null}

                                    {postsLoading && posts.length === 0 ? (
                                        <div className="nostr-profile-posts-empty-state">
                                            <Empty className="nostr-profile-posts-empty">
                                                <EmptyHeader>
                                                    <EmptyMedia variant="icon">
                                                        <Spinner />
                                                    </EmptyMedia>
                                                    <EmptyTitle>Cargando publicaciones</EmptyTitle>
                                                    <EmptyDescription>{`Recuperando notas de ${displayName}.`}</EmptyDescription>
                                                </EmptyHeader>
                                            </Empty>
                                        </div>
                                    ) : null}

                                    {postsLoading && posts.length > 0 ? <ListLoadingFooter loading label="Cargando publicaciones..." /> : null}

                                    {hasMorePosts && !postsLoading ? (
                                        <Button type="button" className="justify-self-start" data-testid="profile-load-more-posts" onClick={() => void onLoadMorePosts()}>
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
                                                <EmptyDescription>{`Recuperando seguidores de ${displayName}.`}</EmptyDescription>
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
                                                <ItemGroup className="nostr-profile-network-list">
                                                    {visibleFollowers.map((followerPubkey) => (
                                                        <div key={followerPubkey} className="nostr-profile-network-item-wrap">
                                                            {renderNetworkPersonItem(followerPubkey)}
                                                        </div>
                                                    ))}
                                                </ItemGroup>
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
                                                <EmptyDescription>{`Recuperando personas a las que sigue ${displayName}.`}</EmptyDescription>
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
                                                <ItemGroup className="nostr-profile-network-list">
                                                    {visibleFollows.map((followPubkey) => (
                                                        <div key={followPubkey} className="nostr-profile-network-item-wrap">
                                                            {renderNetworkPersonItem(followPubkey)}
                                                        </div>
                                                    ))}
                                                </ItemGroup>
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
                    slides={profile?.picture ? [{ src: profile.picture, alt: `Avatar de ${displayName}` }] : []}
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
