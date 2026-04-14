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
import { ChatsPage, type ChatConversationSummary, type ChatDetailMessage } from './components/ChatsPage';
import { NotificationsPage } from './components/NotificationsPage';
import { FollowingFeedSurface } from './components/FollowingFeedSurface';
import { SettingsPage } from './components/SettingsPage';
import { UserSearchPage } from './components/UserSearchPage';
import { SettingsAboutRoute } from './components/settings-routes/SettingsAboutRoute';
import { SettingsAdvancedRoute } from './components/settings-routes/SettingsAdvancedRoute';
import { SettingsRelayDetailRoute } from './components/settings-routes/SettingsRelayDetailRoute';
import { SettingsRelaysRoute } from './components/settings-routes/SettingsRelaysRoute';
import { SettingsShortcutsRoute } from './components/settings-routes/SettingsShortcutsRoute';
import { SettingsUiRoute } from './components/settings-routes/SettingsUiRoute';
import { SettingsZapsRoute } from './components/settings-routes/SettingsZapsRoute';
import { PersonContextMenuItems } from './components/PersonContextMenuItems';
import { useNostrOverlay, type MapLoaderStage, type NostrOverlayServices } from './hooks/useNostrOverlay';
import { useNip05Verification } from './hooks/useNip05Verification';
import { useFollowingFeedController } from './hooks/useFollowingFeedController';
import { useSocialNotificationsController } from './query/social-notifications.query';
import { useDirectMessagesController } from './query/direct-messages.query';
import { useActiveProfileQuery } from './query/active-profile.query';
import type { EasterEggBuildingClickPayload, MapBridge, OccupiedBuildingContextPayload } from './map-bridge';
import { extractStreetLabelUsernames } from './domain/street-label-users';
import { getEasterEggEntry } from './easter-eggs/catalog';
import { getSpecialBuildingEntry } from './special-buildings/catalog';
import { EASTER_EGG_MISSIONS } from './easter-eggs/missions';
import { createRuntimeSocialNotificationsService } from '../nostr/social-notifications-runtime-service';
import { createRuntimeSocialFeedService } from '../nostr/social-feed-runtime-service';
import { resolveConservativeSocialRelaySets } from '../nostr/relay-runtime';
import { createTransportPool } from '../nostr/transport-pool';
import type { DmTransport } from '../nostr/dm-transport';
import { buildSettingsPath, settingsViewFromPathname, type SettingsRouteView } from './settings/settings-routing';
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

export function App({ mapBridge, services }: AppProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const overlay = useNostrOverlay({ mapBridge, services });
    const activeProfileData = useActiveProfileQuery({
        pubkey: overlay.activeProfilePubkey,
        service: overlay.activeProfileService,
    });
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettings, setZapSettings] = useState<ZapSettingsState>(() => loadZapSettings());
    const [easterEggProgress, setEasterEggProgress] = useState<EasterEggProgressState>(() => loadEasterEggProgress());
    const [buildingContextMenu, setBuildingContextMenu] = useState<OccupiedBuildingContextMenuState | null>(null);
    const [activeEasterEgg, setActiveEasterEgg] = useState<EasterEggDialogState | null>(null);
    const [chatComposerFocusKey, setChatComposerFocusKey] = useState('');
    const [chatPinnedConversationId, setChatPinnedConversationId] = useState<string | null>(null);
    const chatRouteSyncKeyRef = useRef('');
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
            ...activeProfileData.networkProfiles,
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
        activeProfileData.networkProfiles,
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
        setEasterEggProgress(loadEasterEggProgress({ ownerPubkey: overlay.ownerPubkey }));
    }, [overlay.ownerPubkey]);

    useEffect(() => {
        setZapSettings(loadZapSettings({ ownerPubkey: overlay.ownerPubkey }));
    }, [overlay.ownerPubkey]);

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
                ownerPubkey: overlay.ownerPubkey,
            }));
            easterEggNonceRef.current += 1;
            setActiveEasterEgg({
                ...payload,
                nonce: easterEggNonceRef.current,
            });
        });
    }, [mapBridge, overlay.ownerPubkey]);

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

    const directMessages = useDirectMessagesController({
        ownerPubkey: overlay.ownerPubkey,
        dmService: overlay.directMessagesService,
    });
    const chatState = directMessages;
    const openChatStateList = chatState.openList;
    const openChatStateConversation = chatState.openConversation;
    const socialTransportPool = useMemo(() => createTransportPool<DmTransport>(), [overlay.ownerPubkey]);
    const socialNotificationsService = useMemo(
        () => services?.socialNotificationsService ?? createRuntimeSocialNotificationsService({
            resolveRelays: () => resolveConservativeSocialRelaySets({ ownerPubkey: overlay.ownerPubkey }).primary,
            resolveFallbackRelays: () => resolveConservativeSocialRelaySets({ ownerPubkey: overlay.ownerPubkey }).fallback,
            transportPool: socialTransportPool,
        }),
        [overlay.ownerPubkey, services?.socialNotificationsService, socialTransportPool]
    );
    const socialNotifications = useSocialNotificationsController({
        ownerPubkey: overlay.ownerPubkey,
        service: socialNotificationsService,
    });
    const socialState = socialNotifications;
    const socialFeedService = useMemo(
        () => services?.socialFeedService ?? createRuntimeSocialFeedService({
            resolveRelays: () => resolveConservativeSocialRelaySets({ ownerPubkey: overlay.ownerPubkey }).primary,
            resolveFallbackRelays: () => resolveConservativeSocialRelaySets({ ownerPubkey: overlay.ownerPubkey }).fallback,
            transportPool: socialTransportPool,
        }),
        [overlay.ownerPubkey, services?.socialFeedService, socialTransportPool]
    );
    const followingFeed = useFollowingFeedController({
        ownerPubkey: overlay.ownerPubkey,
        follows: overlay.follows,
        canWrite: overlay.canWrite,
        service: socialFeedService,
        writeGateway: overlay.writeGateway,
    });
    const followingFeedProfilesByPubkey = useMemo(() => ({
        ...overlay.followerProfiles,
        ...overlay.profiles,
        ...(overlay.ownerPubkey && overlay.ownerProfile
            ? { [overlay.ownerPubkey]: overlay.ownerProfile }
            : {}),
    }), [overlay.followerProfiles, overlay.ownerProfile, overlay.ownerPubkey, overlay.profiles]);

    const chatConversations = useMemo<ChatConversationSummary[]>(() => {
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
    }, [chatState, overlay.profiles, overlay.followerProfiles, chatPinnedConversationId]);

    const chatActiveConversationId = chatState.activeConversationId ?? chatPinnedConversationId;

    const chatMessages = useMemo<ChatDetailMessage[]>(() => {
        if (!chatActiveConversationId) {
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
    }, [chatState, chatActiveConversationId]);

    const canAccessDirectMessages = Boolean(overlay.ownerPubkey && overlay.canDirectMessages && overlay.directMessagesService);
    const canAccessSocialNotifications = Boolean(overlay.ownerPubkey);
    const canAccessFollowingFeed = Boolean(overlay.ownerPubkey);
    const activeSettingsView = useMemo(
        () => settingsViewFromPathname(location.pathname),
        [location.pathname]
    );
    const isMapRoute = location.pathname === '/';
    const isAgoraRoute = location.pathname === '/agora';
    const isChatsRoute = location.pathname === '/chats';
    const isNotificationsRoute = location.pathname === '/notificaciones';
    const followingFeedHasUnread = !followingFeed.isOpen && followingFeed.hasUnread;
    const canSendChatMessages = canAccessDirectMessages;

    useEffect(() => {
        if (isAgoraRoute && canAccessFollowingFeed) {
            void followingFeed.open();
            return;
        }

        followingFeed.close();
    }, [isAgoraRoute, canAccessFollowingFeed, followingFeed.close, followingFeed.open]);

    useEffect(() => {
        if (isNotificationsRoute && canAccessSocialNotifications) {
            if (!socialState.isOpen) {
                socialNotifications.open();
            }
            return;
        }

        if (socialState.isOpen) {
            socialNotifications.close();
        }
    }, [
        isNotificationsRoute,
        canAccessSocialNotifications,
        socialState.isOpen,
        socialNotifications.close,
        socialNotifications.open,
    ]);

    useEffect(() => {
        if (!isChatsRoute) {
            chatRouteSyncKeyRef.current = '';
            return;
        }

        if (!overlay.ownerPubkey) {
            return;
        }

        if (!canAccessDirectMessages) {
            navigate('/', { replace: true });
            return;
        }

        const syncKey = `${overlay.ownerPubkey}:${location.search}`;
        if (chatRouteSyncKeyRef.current === syncKey) {
            return;
        }
        chatRouteSyncKeyRef.current = syncKey;

        const params = new URLSearchParams(location.search);
        const peer = params.get('peer');
        const compose = params.get('compose') === '1';

        if (peer) {
            openChatStateConversation(peer);
            setChatPinnedConversationId(peer);
            if (compose) {
                setChatComposerFocusKey(`${peer}:${Date.now()}`);
            }
            return;
        }

        openChatStateList();
        setChatPinnedConversationId(null);
    }, [
        canAccessDirectMessages,
        isChatsRoute,
        location.search,
        navigate,
        openChatStateConversation,
        openChatStateList,
        overlay.ownerPubkey,
    ]);

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
        if (!canAccessDirectMessages) {
            return;
        }

        chatState.openList();
        setChatPinnedConversationId(null);
        navigate('/chats');
    };

    const openChatConversation = (conversationId: string, focusComposer: boolean = false): void => {
        if (!canAccessDirectMessages) {
            return;
        }

        chatState.openConversation(conversationId);
        setChatPinnedConversationId(conversationId);
        const params = new URLSearchParams({ peer: conversationId });
        if (focusComposer) {
            params.set('compose', '1');
        }
        navigate(`/chats?${params.toString()}`);
        if (focusComposer) {
            setChatComposerFocusKey(`${conversationId}:${Date.now()}`);
        }
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

    const openSettingsPage = (view: SettingsRouteView = 'ui'): void => {
        navigate(buildSettingsPath(view));
    };

    const openDmFromContextMenu = async (pubkey: string): Promise<void> => {
        if (!canAccessDirectMessages) {
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
                chatHasUnread={chatState.hasUnreadGlobal}
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
                onOpenSettings={openSettingsPage}
                onLogout={async () => {
                    await overlay.logoutSession?.();
                    setEasterEggProgress({ discoveredIds: [] });
                    setZapSettings(loadZapSettings());
                    setActiveEasterEgg(null);
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
                    onConfigureZapAmounts={() => openSettingsPage('zaps')}
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
                                            openSettingsPage('zaps');
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

            <Routes>
                <Route
                    path="/agora"
                    element={(
                        <FollowingFeedSurface
                            items={followingFeed.items}
                            profilesByPubkey={followingFeedProfilesByPubkey}
                            engagementByEventId={followingFeed.engagementByEventId}
                            isLoadingFeed={followingFeed.isLoadingFeed}
                            feedError={followingFeed.feedError}
                            hasMoreFeed={followingFeed.hasMoreFeed}
                            activeThread={followingFeed.activeThread}
                            canWrite={overlay.canWrite}
                            isPublishingPost={followingFeed.isPublishingPost}
                            isPublishingReply={followingFeed.isPublishingReply}
                            publishError={followingFeed.publishError}
                            reactionByEventId={followingFeed.reactionByEventId}
                            repostByEventId={followingFeed.repostByEventId}
                            pendingReactionByEventId={followingFeed.pendingReactionByEventId}
                            pendingRepostByEventId={followingFeed.pendingRepostByEventId}
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
                        />
                    )}
                />
                <Route
                    path="/notificaciones"
                    element={(
                        <NotificationsPage
                            hasUnread={socialState.hasUnread}
                            notifications={socialState.pendingSnapshot}
                            onClose={closeNotifications}
                        />
                    )}
                />
                <Route
                    path="/chats"
                    element={(
                        <ChatsPage
                            hasUnreadGlobal={chatState.hasUnreadGlobal}
                            isLoadingConversations={chatState.isBootstrapping}
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
                            onOpenConversation={(conversationId) => openChatConversation(conversationId)}
                            onBackToList={openChatList}
                            onSendMessage={async (plaintext) => {
                                if (!chatActiveConversationId || !canSendChatMessages) {
                                    return;
                                }

                                await chatState.sendMessage(chatActiveConversationId, plaintext);
                            }}
                        />
                    )}
                />
                <Route
                    path="/descubre"
                    element={(
                        <DiscoverPage
                            discoveredIds={easterEggProgress.discoveredIds}
                        />
                    )}
                />
                <Route
                    path="/buscar-usuarios"
                    element={(
                        <UserSearchPage
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
                    path="/settings"
                    element={(
                        <SettingsPage
                            mapBridge={mapBridge}
                            suggestedRelays={overlay.suggestedRelays}
                            suggestedRelaysByType={overlay.suggestedRelaysByType}
                            onUiSettingsChange={setUiSettings}
                            ownerPubkey={overlay.ownerPubkey}
                            zapSettings={zapSettings}
                            onZapSettingsChange={setZapSettings}
                            onClose={() => navigate('/')}
                        />
                    )}
                >
                    <Route index element={<Navigate to="ui" replace />} />
                    <Route path="ui" element={<SettingsUiRoute />} />
                    <Route path="shortcuts" element={<SettingsShortcutsRoute />} />
                    <Route path="relays" element={<SettingsRelaysRoute />} />
                    <Route path="relays/detail" element={<SettingsRelayDetailRoute />} />
                    <Route path="zaps" element={<SettingsZapsRoute />} />
                    <Route path="about" element={<SettingsAboutRoute />} />
                    <Route path="advanced" element={<SettingsAdvancedRoute />} />
                    <Route path="*" element={<Navigate to="ui" replace />} />
                </Route>
                <Route path="/settings/:view" element={<Navigate to="/settings/ui" replace />} />
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
                    followsCount={activeProfileData.followsCount}
                    followersCount={activeProfileData.followersCount}
                    statsLoading={activeProfileData.statsLoading}
                    statsError={activeProfileData.statsError}
                    posts={activeProfileData.posts}
                    postsLoading={activeProfileData.postsLoading}
                    postsError={activeProfileData.postsError}
                    hasMorePosts={activeProfileData.hasMorePosts}
                    follows={activeProfileData.follows}
                    followers={activeProfileData.followers}
                    networkProfiles={activeProfileData.networkProfiles}
                    networkLoading={activeProfileData.networkLoading}
                    networkError={activeProfileData.networkError}
                    verification={verificationByPubkey[overlay.activeProfilePubkey]}
                    onLoadMorePosts={activeProfileData.loadMorePosts}
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
