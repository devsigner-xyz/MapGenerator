import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { getDefaultUiSettings, loadUiSettings, saveUiSettings, type UiSettingsState } from '../nostr/ui-settings';
import { loadZapSettings, type ZapSettingsState } from '../nostr/zap-settings';
import {
    loadEasterEggProgress,
    markEasterEggDiscovered,
    type EasterEggProgressState,
} from '../nostr/easter-egg-progress';
import { encodeHexToNpub } from '../nostr/npub';
import { MapPresenceLayer } from './components/MapPresenceLayer';
import type { SettingsView } from './components/settings-pages/types';
import { OccupantProfileDialog } from './components/OccupantProfileDialog';
import { EasterEggDialog } from './components/EasterEggDialog';
import { DiscoverPage } from './components/DiscoverPage';
import { SocialSidebar } from './components/SocialSidebar';
import {
    OverlaySidebar,
    OVERLAY_SIDEBAR_COLLAPSED_WIDTH,
    OVERLAY_SIDEBAR_EXPANDED_WIDTH,
} from './components/OverlaySidebar';
import { MapZoomControls } from './components/MapZoomControls';
import { MapDisplayToggleControls } from './components/MapDisplayToggleControls';
import { CityStatsPage } from './components/CityStatsPage';
import { ChatDialog, type ChatConversationSummary, type ChatDetailMessage } from './components/ChatDialog';
import { NotificationsPage } from './components/NotificationsPage';
import { FollowingFeedSurface } from './components/FollowingFeedSurface';
import { SettingsPage } from './components/SettingsPage';
import { UserSearchPage } from './components/UserSearchPage';
import { PersonContextMenuItems } from './components/PersonContextMenuItems';
import { useNostrOverlay, type MapLoaderStage, type NostrOverlayServices } from './hooks/useNostrOverlay';
import { useNip05Verification } from './hooks/useNip05Verification';
import { useFollowingFeed } from './hooks/useFollowingFeed';
import { useSocialNotifications } from './hooks/useSocialNotifications';
import type { EasterEggBuildingClickPayload, MapBridge, OccupiedBuildingContextPayload } from './map-bridge';
import { extractStreetLabelUsernames } from './domain/street-label-users';
import { getEasterEggEntry } from './easter-eggs/catalog';
import { getSpecialBuildingEntry } from './special-buildings/catalog';
import { EASTER_EGG_MISSIONS } from './easter-eggs/missions';
import { createRuntimeSocialNotificationsService } from '../nostr/social-notifications-runtime-service';
import { createRuntimeSocialFeedService } from '../nostr/social-feed-runtime-service';
import { useIsMobile } from '@/hooks/use-mobile';
import { Spinner } from '@/components/ui/spinner';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Toaster, toast } from 'sonner';

interface AppProps {
    mapBridge: MapBridge | null;
    services?: NostrOverlayServices;
}

interface OccupiedBuildingContextMenuState extends OccupiedBuildingContextPayload {
    nonce: number;
}

interface EasterEggDialogState extends EasterEggBuildingClickPayload {
    nonce: number;
}

function mapLoaderStageLabel(stage: MapLoaderStage | null): string | null {
    if (stage === 'connecting_relay') {
        return 'Conectando a relay...';
    }

    if (stage === 'fetching_data') {
        return 'Obteniendo datos...';
    }

    if (stage === 'building_map') {
        return 'Construyendo mapa...';
    }

    return null;
}

function settingsViewFromPathname(pathname: string): SettingsView | null {
    if (!pathname.startsWith('/settings/')) {
        return null;
    }

    const segment = pathname.slice('/settings/'.length);
    if (
        segment === 'advanced'
        || segment === 'ui'
        || segment === 'shortcuts'
        || segment === 'relays'
        || segment === 'about'
        || segment === 'zaps'
    ) {
        return segment;
    }

    return null;
}

export function App({ mapBridge, services }: AppProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const overlay = useNostrOverlay({ mapBridge, services });
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettings, setZapSettings] = useState<ZapSettingsState>(() => loadZapSettings());
    const [easterEggProgress, setEasterEggProgress] = useState<EasterEggProgressState>(() => loadEasterEggProgress());
    const [buildingContextMenu, setBuildingContextMenu] = useState<OccupiedBuildingContextMenuState | null>(null);
    const [activeEasterEgg, setActiveEasterEgg] = useState<EasterEggDialogState | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatComposerFocusKey, setChatComposerFocusKey] = useState('');
    const [chatStateVersion, setChatStateVersion] = useState(0);
    const [chatPinnedConversationId, setChatPinnedConversationId] = useState<string | null>(null);
    const isMobile = useIsMobile();
    const contextMenuTriggerRef = useRef<HTMLSpanElement | null>(null);
    const contextMenuNonceRef = useRef(0);
    const easterEggNonceRef = useRef(0);
    const lastTrafficParticlesCountRef = useRef(
        Math.max(
            1,
            uiSettings.trafficParticlesCount > 0
                ? uiSettings.trafficParticlesCount
                : getDefaultUiSettings().trafficParticlesCount
        )
    );
    const loginDisabled = overlay.status !== 'idle' && overlay.status !== 'success' && overlay.status !== 'error';
    const mapLoaderText = mapLoaderStageLabel(overlay.mapLoaderStage);
    const regenerateDisabled = !mapBridge || overlay.mapLoaderStage !== null;
    const lastErrorToastRef = useRef<string | undefined>(undefined);
    const streetLabelUsernames = useMemo(() => extractStreetLabelUsernames({
        occupancyByBuildingIndex: overlay.occupancyByBuildingIndex,
        profiles: overlay.profiles,
    }), [overlay.occupancyByBuildingIndex, overlay.profiles]);
    const verificationProfilesByPubkey = useMemo(() => {
        const merged = {
            ...overlay.profiles,
            ...overlay.followerProfiles,
            ...overlay.activeProfileNetworkProfiles,
        };

        if (overlay.ownerPubkey && overlay.ownerProfile) {
            merged[overlay.ownerPubkey] = overlay.ownerProfile;
        }

        if (overlay.activeProfilePubkey && overlay.activeProfile) {
            merged[overlay.activeProfilePubkey] = overlay.activeProfile;
        }

        return merged;
    }, [
        overlay.profiles,
        overlay.followerProfiles,
        overlay.activeProfileNetworkProfiles,
        overlay.ownerPubkey,
        overlay.ownerProfile,
        overlay.activeProfilePubkey,
        overlay.activeProfile,
    ]);
    const verificationTargetPubkeys = useMemo(() => {
        const occupiedPubkeys = Object.values(overlay.occupancyByBuildingIndex);
        return [...new Set([
            ...(overlay.ownerPubkey ? [overlay.ownerPubkey] : []),
            ...overlay.follows,
            ...overlay.followers,
            ...occupiedPubkeys,
            ...(overlay.activeProfilePubkey ? [overlay.activeProfilePubkey] : []),
        ])];
    }, [
        overlay.ownerPubkey,
        overlay.follows,
        overlay.followers,
        overlay.occupancyByBuildingIndex,
        overlay.activeProfilePubkey,
    ]);
    const verificationByPubkey = useNip05Verification({
        profilesByPubkey: verificationProfilesByPubkey,
        targetPubkeys: verificationTargetPubkeys,
    });
    const verifiedBuildingIndexes = useMemo(() => {
        if (!uiSettings.verifiedBuildingsOverlayEnabled) {
            return [] as number[];
        }

        return Object.entries(overlay.occupancyByBuildingIndex)
            .filter(([, pubkey]) => verificationByPubkey[pubkey]?.status === 'verified')
            .map(([buildingIndex]) => Number(buildingIndex))
            .filter((value) => Number.isInteger(value) && value >= 0);
    }, [uiSettings.verifiedBuildingsOverlayEnabled, overlay.occupancyByBuildingIndex, verificationByPubkey]);
    const discoveredMissionsCount = useMemo(
        () => new Set(easterEggProgress.discoveredIds).size,
        [easterEggProgress.discoveredIds]
    );

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setViewportInsetLeft(
            isMobile
                ? 0
                : sidebarOpen
                    ? OVERLAY_SIDEBAR_EXPANDED_WIDTH
                    : OVERLAY_SIDEBAR_COLLAPSED_WIDTH
        );
        return () => {
            mapBridge.setViewportInsetLeft(0);
        };
    }, [isMobile, mapBridge, sidebarOpen]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setStreetLabelsEnabled(uiSettings.streetLabelsEnabled);
        mapBridge.setStreetLabelsZoomLevel(uiSettings.streetLabelsZoomLevel);
    }, [mapBridge, uiSettings.streetLabelsEnabled, uiSettings.streetLabelsZoomLevel]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setTrafficParticlesCount(uiSettings.trafficParticlesCount);
        mapBridge.setTrafficParticlesSpeed(uiSettings.trafficParticlesSpeed);
    }, [mapBridge, uiSettings.trafficParticlesCount, uiSettings.trafficParticlesSpeed]);

    useEffect(() => {
        if (uiSettings.trafficParticlesCount > 0) {
            lastTrafficParticlesCountRef.current = uiSettings.trafficParticlesCount;
        }
    }, [uiSettings.trafficParticlesCount]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setStreetLabelUsernames(streetLabelUsernames);
    }, [mapBridge, streetLabelUsernames]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setVerifiedBuildingIndexes(verifiedBuildingIndexes);
    }, [mapBridge, verifiedBuildingIndexes]);

    useEffect(() => {
        if (overlay.status !== 'error' || !overlay.error) {
            lastErrorToastRef.current = undefined;
            return;
        }

        if (lastErrorToastRef.current === overlay.error) {
            return;
        }

        lastErrorToastRef.current = overlay.error;
        toast.error(overlay.error, { duration: 2200 });
    }, [overlay.status, overlay.error]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onOccupiedBuildingContextMenu((payload) => {
            contextMenuNonceRef.current += 1;
            setBuildingContextMenu({
                ...payload,
                nonce: contextMenuNonceRef.current,
            });
        });
    }, [mapBridge]);

    useEffect(() => {
        if (!mapBridge || !mapBridge.onEasterEggBuildingClick) {
            return;
        }

        return mapBridge.onEasterEggBuildingClick((payload) => {
            setEasterEggProgress((currentProgress) => markEasterEggDiscovered({
                easterEggId: payload.easterEggId,
                currentState: currentProgress,
            }));
            easterEggNonceRef.current += 1;
            setActiveEasterEgg({
                ...payload,
                nonce: easterEggNonceRef.current,
            });
        });
    }, [mapBridge]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onSpecialBuildingClick((payload) => {
            const entry = getSpecialBuildingEntry(payload.specialBuildingId);
            if (entry.action === 'open_agora') {
                navigate('/agora');
            }
        });
    }, [mapBridge, navigate]);

    useEffect(() => {
        if (!buildingContextMenu || !contextMenuTriggerRef.current) {
            return;
        }

        const target = contextMenuTriggerRef.current;
        const timer = window.setTimeout(() => {
            target.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: buildingContextMenu.clientX,
                clientY: buildingContextMenu.clientY,
            }));
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [buildingContextMenu]);

    const encodePubkeyAsNpub = (pubkey: string): string => {
        try {
            return encodeHexToNpub(pubkey);
        } catch {
            return pubkey;
        }
    };

    const refreshChatState = (): void => {
        setChatStateVersion((version) => version + 1);
    };

    const chatState = overlay.directMessages?.getState();
    const socialNotificationsService = useMemo(
        () => services?.socialNotificationsService ?? createRuntimeSocialNotificationsService(),
        [services?.socialNotificationsService]
    );
    const socialNotifications = useSocialNotifications({
        ownerPubkey: overlay.ownerPubkey,
        service: socialNotificationsService,
    });
    const socialState = socialNotifications.getState();
    const socialFeedService = useMemo(
        () => services?.socialFeedService ?? createRuntimeSocialFeedService(),
        [services?.socialFeedService]
    );
    const followingFeed = useFollowingFeed({
        ownerPubkey: overlay.ownerPubkey,
        follows: overlay.follows,
        canWrite: overlay.canWrite,
        service: socialFeedService,
        writeGateway: overlay.writeGateway,
    });
    const followingFeedState = followingFeed.getState();
    const followingFeedProfilesByPubkey = useMemo(() => ({
        ...overlay.followerProfiles,
        ...overlay.profiles,
        ...(overlay.ownerPubkey && overlay.ownerProfile
            ? { [overlay.ownerPubkey]: overlay.ownerProfile }
            : {}),
    }), [overlay.followerProfiles, overlay.ownerProfile, overlay.ownerPubkey, overlay.profiles]);

    useEffect(() => {
        if (!overlay.directMessages) {
            refreshChatState();
            return;
        }

        setChatStateVersion(overlay.directMessages.getVersion());
        return overlay.directMessages.subscribe(() => {
            setChatStateVersion(overlay.directMessages?.getVersion() ?? 0);
        });
    }, [overlay.directMessages, overlay.ownerPubkey]);

    const chatConversations = useMemo<ChatConversationSummary[]>(() => {
        if (!chatState) {
            if (!chatPinnedConversationId) {
                return [];
            }

            const profile = overlay.profiles[chatPinnedConversationId] || overlay.followerProfiles[chatPinnedConversationId];
            const title = profile?.displayName ?? profile?.name ?? `${chatPinnedConversationId.slice(0, 10)}...${chatPinnedConversationId.slice(-6)}`;
            return [{
                id: chatPinnedConversationId,
                peerPubkey: chatPinnedConversationId,
                title,
                lastMessagePreview: '',
                lastMessageAt: 0,
                hasUnread: false,
            }];
        }

        const summaries = Object.values(chatState.conversations)
            .map((conversation) => {
                const lastMessage = conversation.messages[conversation.messages.length - 1];
                const profile = overlay.profiles[conversation.id] || overlay.followerProfiles[conversation.id];
                const title = profile?.displayName ?? profile?.name ?? `${conversation.id.slice(0, 10)}...${conversation.id.slice(-6)}`;

                return {
                    id: conversation.id,
                    peerPubkey: conversation.id,
                    title,
                    lastMessagePreview: lastMessage?.plaintext || '',
                    lastMessageAt: lastMessage?.createdAt || 0,
                    hasUnread: conversation.hasUnread,
                };
            })
            .sort((left, right) => right.lastMessageAt - left.lastMessageAt);

        if (chatPinnedConversationId && !summaries.some((conversation) => conversation.id === chatPinnedConversationId)) {
            const profile = overlay.profiles[chatPinnedConversationId] || overlay.followerProfiles[chatPinnedConversationId];
            const title = profile?.displayName ?? profile?.name ?? `${chatPinnedConversationId.slice(0, 10)}...${chatPinnedConversationId.slice(-6)}`;
            summaries.unshift({
                id: chatPinnedConversationId,
                peerPubkey: chatPinnedConversationId,
                title,
                lastMessagePreview: '',
                lastMessageAt: 0,
                hasUnread: false,
            });
        }

        return summaries;
    }, [chatStateVersion, chatState, overlay.profiles, overlay.followerProfiles, chatPinnedConversationId]);

    const chatActiveConversationId = chatState?.activeConversationId ?? chatPinnedConversationId;

    const chatMessages = useMemo<ChatDetailMessage[]>(() => {
        if (!chatState || !chatActiveConversationId) {
            return [];
        }

        const conversation = chatState.conversations[chatActiveConversationId];
        if (!conversation) {
            return [];
        }

        return conversation.messages.map((message) => ({
            id: message.id,
            direction: message.direction,
            plaintext: message.plaintext,
            createdAt: message.createdAt,
            deliveryState: message.deliveryState,
            isUndecryptable: message.isUndecryptable,
        }));
    }, [chatStateVersion, chatState, chatActiveConversationId]);

    const canAccessDirectMessages = Boolean(overlay.ownerPubkey && overlay.canDirectMessages && overlay.directMessages);
    const canAccessSocialNotifications = Boolean(overlay.ownerPubkey);
    const canAccessFollowingFeed = Boolean(overlay.ownerPubkey);
    const activeSettingsView = useMemo(
        () => settingsViewFromPathname(location.pathname),
        [location.pathname]
    );
    const isMapRoute = location.pathname === '/';
    const isAgoraRoute = location.pathname === '/agora';
    const isNotificationsRoute = location.pathname === '/notificaciones';
    const followingFeedHasUnread = !followingFeedState.isDialogOpen
        && followingFeedState.hasMoreFeed
        && followingFeedState.items.length > 0;
    const canSendChatMessages = canAccessDirectMessages;

    useEffect(() => {
        if (canAccessDirectMessages || !chatOpen) {
            return;
        }

        setChatOpen(false);
    }, [canAccessDirectMessages, chatOpen]);

    useEffect(() => {
        if (isAgoraRoute && canAccessFollowingFeed) {
            void followingFeed.openDialog();
            return;
        }

        followingFeed.closeDialog();
    }, [isAgoraRoute, canAccessFollowingFeed, followingFeed]);

    useEffect(() => {
        if (isNotificationsRoute && canAccessSocialNotifications) {
            socialNotifications.openDialog();
            return;
        }

        socialNotifications.closeDialog();
    }, [isNotificationsRoute, canAccessSocialNotifications, socialNotifications]);

    useEffect(() => {
        if (!location.pathname.startsWith('/settings/')) {
            return;
        }

        if (!activeSettingsView) {
            navigate('/settings/ui', { replace: true });
        }
    }, [location.pathname, activeSettingsView, navigate]);

    const copyOwnerIdentifier = async (value: string): Promise<void> => {
        if (!value) {
            return;
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            toast.success('npub copiada', { duration: 1600 });
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            toast.success('npub copiada', { duration: 1600 });
        } finally {
            textarea.remove();
        }
    };

    const locateOwnerOnMap = (): void => {
        if (!mapBridge || overlay.ownerBuildingIndex === undefined) {
            return;
        }

        mapBridge.focusBuilding(overlay.ownerBuildingIndex);
    };

    const locateFollowingOnMap = (pubkey: string): void => {
        if (!mapBridge || !pubkey) {
            return;
        }

        const match = Object.entries(overlay.occupancyByBuildingIndex).find(([, assignedPubkey]) => assignedPubkey === pubkey);
        if (!match) {
            return;
        }

        const buildingIndex = Number(match[0]);
        if (!Number.isInteger(buildingIndex)) {
            return;
        }

        mapBridge.focusBuilding(buildingIndex);
    };

    const closeOccupiedContextMenu = (): void => {
        setBuildingContextMenu(null);
    };

    const openChatList = (): void => {
        if (!canAccessDirectMessages || !overlay.directMessages) {
            return;
        }

        overlay.directMessages.openList();
        setChatPinnedConversationId(null);
        setChatOpen(true);
        refreshChatState();
    };

    const openChatConversation = (conversationId: string, focusComposer: boolean = false): void => {
        if (!canAccessDirectMessages || !overlay.directMessages) {
            return;
        }

        overlay.directMessages.openConversation(conversationId);
        setChatPinnedConversationId(conversationId);
        setChatOpen(true);
        if (focusComposer) {
            setChatComposerFocusKey(`${conversationId}:${Date.now()}`);
        }
        refreshChatState();
    };

    const closeChat = (): void => {
        setChatOpen(false);
    };

    const openNotifications = (): void => {
        if (!canAccessSocialNotifications) {
            return;
        }

        navigate('/notificaciones');
    };

    const closeNotifications = (): void => {
        navigate('/');
    };

    const openFollowingFeed = (): void => {
        if (!canAccessFollowingFeed) {
            return;
        }

        navigate('/agora');
    };

    const openGlobalUserSearch = (): void => {
        navigate('/buscar-usuarios');
    };

    const closeGlobalUserSearch = (): void => {
        navigate('/');
    };

    const setStreetLabelsQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            streetLabelsEnabled: enabled,
        }));
    };

    const setSpecialMarkersQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            specialMarkersEnabled: enabled,
        }));
    };

    const setCarsQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => {
            if (enabled) {
                const restoredCount = currentSettings.trafficParticlesCount > 0
                    ? currentSettings.trafficParticlesCount
                    : Math.max(1, lastTrafficParticlesCountRef.current);
                return saveUiSettings({
                    ...currentSettings,
                    trafficParticlesCount: restoredCount,
                });
            }

            if (currentSettings.trafficParticlesCount > 0) {
                lastTrafficParticlesCountRef.current = currentSettings.trafficParticlesCount;
            }

            return saveUiSettings({
                ...currentSettings,
                trafficParticlesCount: 0,
            });
        });
    };

    const openSettingsDialog = (view: SettingsView = 'ui'): void => {
        navigate(`/settings/${view}`);
    };

    const openDmFromContextMenu = async (pubkey: string): Promise<void> => {
        if (!canAccessDirectMessages || !overlay.directMessages) {
            return;
        }

        openChatConversation(pubkey, true);
    };

    return (
        <div
            className="nostr-overlay-shell"
            style={{ width: isMobile ? '100vw' : `${sidebarOpen ? OVERLAY_SIDEBAR_EXPANDED_WIDTH : OVERLAY_SIDEBAR_COLLAPSED_WIDTH}px` }}
        >
            <OverlaySidebar
                open={sidebarOpen}
                onOpenChange={setSidebarOpen}
                authSession={overlay.authSession}
                ownerPubkey={overlay.ownerPubkey}
                ownerProfile={overlay.ownerProfile}
                canAccessDirectMessages={canAccessDirectMessages}
                canAccessSocialNotifications={canAccessSocialNotifications}
                canAccessFollowingFeed={canAccessFollowingFeed}
                chatHasUnread={chatState?.hasUnreadGlobal ?? false}
                notificationsHasUnread={socialState.hasUnread}
                followingFeedHasUnread={followingFeedHasUnread}
                regenerateDisabled={regenerateDisabled}
                onOpenMap={() => navigate('/')}
                onOpenCityStats={() => navigate('/estadisticas')}
                onOpenChat={openChatList}
                onOpenNotifications={openNotifications}
                onOpenFollowingFeed={openFollowingFeed}
                onOpenGlobalSearch={openGlobalUserSearch}
                onRegenerateMap={overlay.regenerateMap}
                onOpenSettings={openSettingsDialog}
                onLogout={async () => {
                    await overlay.logoutSession?.();
                    navigate('/');
                }}
                onCopyOwnerNpub={copyOwnerIdentifier}
                onLocateOwner={locateOwnerOnMap}
                onViewOwnerDetails={() => {
                    if (overlay.ownerPubkey) {
                        overlay.openActiveProfile(overlay.ownerPubkey, overlay.ownerBuildingIndex);
                    }
                }}
                missionsDiscoveredCount={discoveredMissionsCount}
                missionsTotal={EASTER_EGG_MISSIONS.length}
                onOpenMissions={() => navigate('/descubre')}
            >
                <SocialSidebar
                    ownerPubkey={overlay.ownerPubkey}
                    ownerProfile={overlay.ownerProfile}
                    follows={overlay.follows}
                    profiles={overlay.profiles}
                    followers={overlay.followers}
                    followerProfiles={overlay.followerProfiles}
                    followersLoading={overlay.followersLoading}
                    selectedFollowingPubkey={overlay.selectedPubkey}
                    onSelectFollowing={overlay.selectFollowing}
                    onLocateFollowing={locateFollowingOnMap}
                    onMessagePerson={canAccessDirectMessages ? openDmFromContextMenu : undefined}
                    onViewPersonDetails={(pubkey) => overlay.openActiveProfile(pubkey)}
                    zapAmounts={zapSettings.amounts}
                    onConfigureZapAmounts={() => openSettingsDialog('zaps')}
                    onCopyOwnerNpub={copyOwnerIdentifier}
                    loginDisabled={loginDisabled}
                    authSession={overlay.authSession}
                    canWrite={overlay.canWrite}
                    canEncrypt={overlay.canEncrypt}
                    onStartSession={overlay.startSession}
                    verificationByPubkey={verificationByPubkey}
                />
            </OverlaySidebar>

            {isMapRoute ? (
                <MapZoomControls mapBridge={mapBridge} />
            ) : null}
            {isMapRoute ? (
                <MapDisplayToggleControls
                    carsEnabled={uiSettings.trafficParticlesCount > 0}
                    streetLabelsEnabled={uiSettings.streetLabelsEnabled}
                    specialMarkersEnabled={uiSettings.specialMarkersEnabled}
                    onCarsEnabledChange={setCarsQuickToggle}
                    onStreetLabelsEnabledChange={setStreetLabelsQuickToggle}
                    onSpecialMarkersEnabledChange={setSpecialMarkersQuickToggle}
                />
            ) : null}

            {buildingContextMenu ? (
                <div
                    className="nostr-context-anchor"
                    style={{
                        left: `${buildingContextMenu.clientX}px`,
                        top: `${buildingContextMenu.clientY}px`,
                    }}
                >
                    <ContextMenu
                        key={buildingContextMenu.nonce}
                    >
                        <ContextMenuTrigger asChild>
                            <span ref={contextMenuTriggerRef} className="nostr-context-anchor-trigger" aria-hidden="true" />
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                            <PersonContextMenuItems
                                testIdPrefix="context"
                                onCopyNpub={() => copyOwnerIdentifier(encodePubkeyAsNpub(buildingContextMenu.pubkey))}
                                onSendMessage={canAccessDirectMessages ? () => openDmFromContextMenu(buildingContextMenu.pubkey) : undefined}
                                onViewDetails={() => overlay.openActiveProfile(buildingContextMenu.pubkey, buildingContextMenu.buildingIndex)}
                                closeMenu={closeOccupiedContextMenu}
                            />

                            <ContextMenuSub>
                                <ContextMenuSubTrigger data-testid="context-zap-submenu">Zap</ContextMenuSubTrigger>
                                <ContextMenuSubContent className="w-44">
                                    {zapSettings.amounts.map((amount) => (
                                        <ContextMenuItem
                                            data-testid={`context-zap-${amount}`}
                                            key={`zap-${amount}`}
                                            onSelect={() => {
                                                closeOccupiedContextMenu();
                                            }}
                                        >
                                            {`${amount} sats`}
                                        </ContextMenuItem>
                                    ))}
                                    <ContextMenuSeparator />
                                    <ContextMenuItem
                                        data-testid="context-zap-configure"
                                        onSelect={() => {
                                            closeOccupiedContextMenu();
                                            openSettingsDialog('zaps');
                                        }}
                                    >
                                        Configurar cantidades
                                    </ContextMenuItem>
                                </ContextMenuSubContent>
                            </ContextMenuSub>
                        </ContextMenuContent>
                    </ContextMenu>
                </div>
            ) : null}

            {mapLoaderText ? (
                <div className="nostr-map-loader-overlay" role="status" aria-live="polite">
                    <div className="nostr-map-loader-card">
                        <Spinner />
                        <p className="nostr-map-loader-text">{mapLoaderText}</p>
                    </div>
                </div>
            ) : null}

            <Toaster richColors position="bottom-center" closeButton={false} />

            <ChatDialog
                open={chatOpen}
                hasUnreadGlobal={chatState?.hasUnreadGlobal ?? false}
                isLoadingConversations={chatState?.isBootstrapping ?? false}
                conversations={chatConversations}
                messages={chatMessages}
                activeConversationId={chatActiveConversationId}
                composerAutoFocusKey={chatComposerFocusKey}
                canSend={canSendChatMessages}
                disabledReason={!overlay.ownerPubkey
                    ? 'Inicia sesión para enviar mensajes privados.'
                    : !overlay.canDirectMessages
                        ? 'Tu sesión no permite mensajería privada (requiere firma y NIP-44).'
                            : undefined}
                onClose={closeChat}
                onOpenConversation={(conversationId) => openChatConversation(conversationId)}
                onBackToList={openChatList}
                onSendMessage={async (plaintext) => {
                    if (!overlay.directMessages || !chatActiveConversationId || !canSendChatMessages) {
                        return;
                    }

                    const sendPromise = overlay.directMessages.sendMessage(chatActiveConversationId, plaintext);
                    refreshChatState();
                    await sendPromise;
                    refreshChatState();
                }}
            />

            <Routes>
                <Route
                    path="/agora"
                    element={(
                        <FollowingFeedSurface
                            items={followingFeedState.items}
                            profilesByPubkey={followingFeedProfilesByPubkey}
                            engagementByEventId={followingFeedState.engagementByEventId}
                            isLoadingFeed={followingFeedState.isLoadingFeed}
                            feedError={followingFeedState.feedError}
                            hasMoreFeed={followingFeedState.hasMoreFeed}
                            activeThread={followingFeedState.activeThread}
                            canWrite={overlay.canWrite}
                            isPublishingPost={followingFeedState.isPublishingPost}
                            isPublishingReply={followingFeedState.isPublishingReply}
                            publishError={followingFeedState.publishError}
                            reactionByEventId={followingFeedState.reactionByEventId}
                            repostByEventId={followingFeedState.repostByEventId}
                            pendingReactionByEventId={followingFeedState.pendingReactionByEventId}
                            pendingRepostByEventId={followingFeedState.pendingRepostByEventId}
                            onLoadMoreFeed={followingFeed.loadNextFeedPage}
                            onOpenThread={followingFeed.openThread}
                            onCloseThread={followingFeed.closeThread}
                            onLoadMoreThread={followingFeed.loadNextThreadPage}
                            onPublishPost={followingFeed.publishPost}
                            onPublishReply={followingFeed.publishReply}
                            onToggleReaction={followingFeed.toggleReaction}
                            onToggleRepost={followingFeed.toggleRepost}
                        />
                    )}
                />
                <Route
                    path="/estadisticas"
                    element={(
                        <CityStatsPage
                            buildingsCount={overlay.buildingsCount}
                            occupiedBuildingsCount={overlay.assignedCount}
                            assignedResidentsCount={overlay.assignedCount}
                            followsCount={overlay.followsCount}
                            followersCount={overlay.followersCount}
                            parkCount={overlay.parkCount}
                            unhousedResidentsCount={overlay.unassignedCount}
                            onClose={() => navigate('/')}
                        />
                    )}
                />
                <Route
                    path="/notificaciones"
                    element={(
                        <NotificationsPage
                            open={socialState.isDialogOpen}
                            hasUnread={socialState.hasUnread}
                            notifications={socialState.pendingSnapshot}
                            onClose={closeNotifications}
                        />
                    )}
                />
                <Route
                    path="/descubre"
                    element={(
                        <DiscoverPage
                            open
                            discoveredIds={easterEggProgress.discoveredIds}
                            onClose={() => navigate('/')}
                        />
                    )}
                />
                <Route
                    path="/buscar-usuarios"
                    element={(
                        <UserSearchPage
                            open
                            onClose={closeGlobalUserSearch}
                            onSearch={overlay.searchUsers}
                            onSelectUser={(pubkey) => {
                                overlay.openActiveProfile(pubkey);
                            }}
                            onMessageUser={canAccessDirectMessages ? openDmFromContextMenu : undefined}
                        />
                    )}
                />
                <Route
                    path="/settings/:view"
                    element={(
                        <SettingsPage
                            mapBridge={mapBridge}
                            suggestedRelays={overlay.suggestedRelays}
                            suggestedRelaysByType={overlay.suggestedRelaysByType}
                            onUiSettingsChange={setUiSettings}
                            zapSettings={zapSettings}
                            onZapSettingsChange={setZapSettings}
                            initialView={activeSettingsView ?? 'ui'}
                            onClose={() => navigate('/')}
                        />
                    )}
                />
                <Route path="/" element={null} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

            <MapPresenceLayer
                mapBridge={mapBridge}
                occupancyByBuildingIndex={overlay.occupancyByBuildingIndex}
                discoveredEasterEggIds={easterEggProgress.discoveredIds}
                profiles={overlay.profiles}
                ownerPubkey={overlay.ownerPubkey}
                ownerProfile={overlay.ownerProfile}
                ownerBuildingIndex={overlay.ownerBuildingIndex}
                occupiedLabelsZoomLevel={uiSettings.occupiedLabelsZoomLevel}
                alwaysVisiblePubkeys={overlay.alwaysVisiblePubkeys}
                specialMarkersEnabled={uiSettings.specialMarkersEnabled}
            />

            {overlay.activeProfilePubkey ? (
                <OccupantProfileDialog
                    pubkey={overlay.activeProfilePubkey}
                    profile={overlay.activeProfile}
                    followsCount={overlay.activeProfileFollowsCount}
                    followersCount={overlay.activeProfileFollowersCount}
                    statsLoading={overlay.activeProfileStatsLoading}
                    statsError={overlay.activeProfileStatsError}
                    posts={overlay.activeProfilePosts}
                    postsLoading={overlay.activeProfilePostsLoading}
                    postsError={overlay.activeProfilePostsError}
                    hasMorePosts={overlay.activeProfilePostsHasMore}
                    follows={overlay.activeProfileFollows}
                    followers={overlay.activeProfileFollowers}
                    networkProfiles={overlay.activeProfileNetworkProfiles}
                    networkLoading={overlay.activeProfileNetworkLoading}
                    networkError={overlay.activeProfileNetworkError}
                    verification={verificationByPubkey[overlay.activeProfilePubkey]}
                    onLoadMorePosts={overlay.loadMoreActiveProfilePosts}
                    onClose={overlay.closeActiveProfileDialog}
                />
            ) : null}

            {activeEasterEgg ? (
                <EasterEggDialog
                    key={activeEasterEgg.nonce}
                    buildingIndex={activeEasterEgg.buildingIndex}
                    entry={getEasterEggEntry(activeEasterEgg.easterEggId)}
                    onClose={() => setActiveEasterEgg(null)}
                />
            ) : null}
        </div>
    );
}
