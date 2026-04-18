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
import { RelayDetailRoute } from './components/RelayDetailRoute';
import { RelaysRoute } from './components/RelaysRoute';
import { LoginGateScreen } from './components/LoginGateScreen';
import { SettingsAboutRoute } from './components/settings-routes/SettingsAboutRoute';
import { SettingsAdvancedRoute } from './components/settings-routes/SettingsAdvancedRoute';
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
import {
    addRelay,
    loadRelaySettings,
    saveRelaySettings,
    type RelaySettingsState,
    type RelayType,
} from '../nostr/relay-settings';
import type { NostrEvent } from '../nostr/types';
import { buildSettingsPath, settingsViewFromPathname, type SettingsRouteView } from './settings/settings-routing';
import { useRelayConnectionSummary } from './hooks/useRelayConnectionSummary';
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

function normalizeHashtag(value: string | null): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim().replace(/^#+/, '').toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
}

export function App({ mapBridge, services }: AppProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const overlay = useNostrOverlay(services ? { mapBridge, services } : { mapBridge });
    const activeProfileData = useActiveProfileQuery({
        ...(overlay.activeProfilePubkey ? { pubkey: overlay.activeProfilePubkey } : {}),
        service: overlay.activeProfileService,
    });
    const relaySettingsOwnerPubkey = overlay.authSession?.pubkey;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [relaySettingsSnapshot, setRelaySettingsSnapshot] = useState<RelaySettingsState>(() => loadRelaySettings(
        relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined
    ));
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettings, setZapSettings] = useState<ZapSettingsState>(() => loadZapSettings());
    const [easterEggProgress, setEasterEggProgress] = useState<EasterEggProgressState>(() => loadEasterEggProgress());
    const [buildingContextMenu, setBuildingContextMenu] = useState<OccupiedBuildingContextMenuState | null>(null);
    const [activeEasterEgg, setActiveEasterEgg] = useState<EasterEggDialogState | null>(null);
    const [chatComposerFocusKey, setChatComposerFocusKey] = useState('');
    const [chatPinnedConversationId, setChatPinnedConversationId] = useState<string | null>(null);
    const [eventReferencesById, setEventReferencesById] = useState<Record<string, NostrEvent>>({});
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
    const sessionRestorationResolved = overlay.sessionRestorationResolved;
    const isAppReady = Boolean(overlay.authSession) && overlay.status === 'success' && !overlay.authSession?.locked;
    const showLoginGate = !sessionRestorationResolved || !isAppReady;
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
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
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
        setEasterEggProgress(loadEasterEggProgress(
            overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : undefined
        ));
    }, [overlay.ownerPubkey]);

    useEffect(() => {
        setZapSettings(loadZapSettings(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : undefined));
    }, [overlay.ownerPubkey]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        if (showLoginGate) {
            mapBridge.setViewportInsetLeft(0);
            return () => {
                mapBridge.setViewportInsetLeft(0);
            };
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
    }, [isMobile, mapBridge, showLoginGate, sidebarOpen]);

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
            if (showLoginGate) {
                return;
            }

            contextMenuNonceRef.current += 1;
            setBuildingContextMenu({
                ...payload,
                nonce: contextMenuNonceRef.current,
            });
        });
    }, [mapBridge, showLoginGate]);

    useEffect(() => {
        if (!mapBridge || !mapBridge.onEasterEggBuildingClick) {
            return;
        }

        return mapBridge.onEasterEggBuildingClick((payload) => {
            setEasterEggProgress((currentProgress) => markEasterEggDiscovered({
                easterEggId: payload.easterEggId,
                currentState: currentProgress,
                ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
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
            if (showLoginGate) {
                return;
            }

            const entry = getSpecialBuildingEntry(payload.specialBuildingId);
            if (entry.action === 'open_agora') {
                navigate('/agora');
            }
        });
    }, [mapBridge, navigate, showLoginGate]);

    useEffect(() => {
        if (showLoginGate) {
            setBuildingContextMenu(null);
        }
    }, [showLoginGate]);

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
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        dmService: overlay.directMessagesService,
    });
    const chatState = directMessages;
    const openChatStateList = chatState.openList;
    const openChatStateConversation = chatState.openConversation;
    const socialNotifications = useSocialNotificationsController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        service: overlay.socialNotificationsService,
    });
    const socialState = socialNotifications;
    const activeAgoraHashtag = useMemo(() => {
        if (location.pathname !== '/agora') {
            return undefined;
        }

        const search = new URLSearchParams(location.search);
        return normalizeHashtag(search.get('tag'));
    }, [location.pathname, location.search]);
    const followingFeed = useFollowingFeedController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        follows: overlay.follows,
        ...(activeAgoraHashtag ? { hashtag: activeAgoraHashtag } : {}),
        canWrite: overlay.canWrite,
        service: overlay.socialFeedService,
        ...(overlay.writeGateway ? { writeGateway: overlay.writeGateway } : {}),
    });
    const richContentProfilesByPubkey = useMemo(() => ({
        ...overlay.followerProfiles,
        ...overlay.profiles,
        ...activeProfileData.networkProfiles,
        ...(overlay.ownerPubkey && overlay.ownerProfile
            ? { [overlay.ownerPubkey]: overlay.ownerProfile }
            : {}),
        ...(overlay.activeProfilePubkey && overlay.activeProfile
            ? { [overlay.activeProfilePubkey]: overlay.activeProfile }
            : {}),
    }), [
        activeProfileData.networkProfiles,
        overlay.activeProfile,
        overlay.activeProfilePubkey,
        overlay.followerProfiles,
        overlay.ownerProfile,
        overlay.ownerPubkey,
        overlay.profiles,
    ]);

    const chatConversations = useMemo<ChatConversationSummary[]>(() => {
        const summaries = Object.values(chatState.conversations)
            .map((conversation) => {
                const lastMessage = conversation.messages[conversation.messages.length - 1];
                const profile = overlay.profiles[conversation.id] || overlay.followerProfiles[conversation.id];
                const verification = verificationByPubkey[conversation.id];
                const title = profile?.displayName ?? profile?.name ?? `${conversation.id.slice(0, 10)}...${conversation.id.slice(-6)}`;

                return {
                    id: conversation.id,
                    peerPubkey: conversation.id,
                    title,
                    ...(profile ? { profile } : {}),
                    ...(verification !== undefined
                        ? { verification }
                        : {}),
                    lastMessagePreview: lastMessage?.plaintext || '',
                    lastMessageAt: lastMessage?.createdAt || 0,
                    hasUnread: conversation.hasUnread,
                };
            })
            .sort((left, right) => right.lastMessageAt - left.lastMessageAt);

        if (chatPinnedConversationId && !summaries.some((conversation) => conversation.id === chatPinnedConversationId)) {
            const profile = overlay.profiles[chatPinnedConversationId] || overlay.followerProfiles[chatPinnedConversationId];
            const verification = verificationByPubkey[chatPinnedConversationId];
            const title = profile?.displayName ?? profile?.name ?? `${chatPinnedConversationId.slice(0, 10)}...${chatPinnedConversationId.slice(-6)}`;
            summaries.unshift({
                id: chatPinnedConversationId,
                peerPubkey: chatPinnedConversationId,
                title,
                ...(profile ? { profile } : {}),
                ...(verification !== undefined
                    ? { verification }
                    : {}),
                lastMessagePreview: '',
                lastMessageAt: 0,
                hasUnread: false,
            });
        }

        return summaries;
    }, [chatState, overlay.profiles, overlay.followerProfiles, chatPinnedConversationId, verificationByPubkey]);

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
            ...(message.isUndecryptable !== undefined
                ? { isUndecryptable: message.isUndecryptable }
                : {}),
        }));
    }, [chatState, chatActiveConversationId]);

    const canAccessDirectMessages = Boolean(overlay.ownerPubkey && overlay.canDirectMessages && overlay.directMessagesService);
    const canAccessSocialNotifications = Boolean(overlay.ownerPubkey && overlay.canWrite && overlay.socialNotificationsService);
    const canAccessFollowingFeed = Boolean(overlay.ownerPubkey);
    const relayStatusTargets = relaySettingsSnapshot.relays;
    const relayConnectionSummary = useRelayConnectionSummary(relayStatusTargets, {
        enabled: relayStatusTargets.length > 0,
        maxConcurrentProbes: 3,
    });
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
    const activeProfileVerification = overlay.activeProfilePubkey
        ? verificationByPubkey[overlay.activeProfilePubkey]
        : undefined;

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
        setRelaySettingsSnapshot(loadRelaySettings(
            relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined
        ));
    }, [relaySettingsOwnerPubkey]);

    useEffect(() => {
        setEventReferencesById({});
    }, [overlay.ownerPubkey]);

    useEffect(() => {
        if (!location.pathname.startsWith('/settings/')) {
            return;
        }

        if (location.pathname.startsWith('/settings/relays')) {
            return;
        }

        if (!activeSettingsView) {
            navigate('/settings/ui', { replace: true });
        }
    }, [location.pathname, activeSettingsView, navigate]);

    const copyText = async (value: string, successMessage: string): Promise<void> => {
        if (!value) {
            return;
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            toast.success(successMessage, { duration: 1600 });
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
            toast.success(successMessage, { duration: 1600 });
        } finally {
            textarea.remove();
        }
    };

    const copyOwnerIdentifier = async (value: string): Promise<void> => {
        await copyText(value, 'npub copiada');
    };

    const copyNoteIdentifier = async (value: string): Promise<void> => {
        await copyText(value, 'ID de nota copiado');
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

        if (!isMapRoute) {
            navigate('/');
        }

        mapBridge.focusBuilding(buildingIndex);
    };

    const selectSidebarPerson = (pubkey: string): void => {
        if (!pubkey) {
            return;
        }

        overlay.selectFollowing(pubkey);

        if (!isMapRoute) {
            navigate('/');
        }
    };

    const followPerson = async (pubkey: string): Promise<void> => {
        if (!pubkey || !overlay.canWrite) {
            return;
        }

        try {
            await overlay.followPerson(pubkey);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo seguir esta cuenta';
            toast.error(message, { duration: 2200 });
        }
    };

    const addRelaySuggestionToSettings = (relayUrl: string, relayTypes: RelayType[]): void => {
        const ownerInput = relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined;
        const currentRelaySettings = loadRelaySettings(ownerInput);
        let nextRelaySettings = currentRelaySettings;

        for (const relayType of relayTypes) {
            nextRelaySettings = addRelay(nextRelaySettings, relayUrl, relayType);
        }

        const savedRelaySettings = saveRelaySettings(nextRelaySettings, ownerInput);
        setRelaySettingsSnapshot(savedRelaySettings);
    };

    const addAllRelaySuggestionsToSettings = (rows: Array<{ relayUrl: string; relayTypes: RelayType[] }>): void => {
        if (!rows || rows.length === 0) {
            return;
        }

        const ownerInput = relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined;
        const currentRelaySettings = loadRelaySettings(ownerInput);
        let nextRelaySettings = currentRelaySettings;

        for (const row of rows) {
            for (const relayType of row.relayTypes) {
                nextRelaySettings = addRelay(nextRelaySettings, row.relayUrl, relayType);
            }
        }

        const savedRelaySettings = saveRelaySettings(nextRelaySettings, ownerInput);
        setRelaySettingsSnapshot(savedRelaySettings);
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

    const selectFollowingFeedHashtag = (hashtag: string): void => {
        const normalized = normalizeHashtag(hashtag);
        if (!normalized) {
            return;
        }

        navigate(`/agora?tag=${encodeURIComponent(normalized)}`);
    };

    const selectProfilePostHashtag = (hashtag: string): void => {
        const normalized = normalizeHashtag(hashtag);
        if (!normalized) {
            return;
        }

        overlay.closeActiveProfileDialog();
        navigate(`/agora?tag=${encodeURIComponent(normalized)}`);
    };

    const openMentionedProfile = (pubkey: string): void => {
        if (!pubkey) {
            return;
        }

        overlay.openActiveProfile(pubkey);
    };

    const resolveMentionProfiles = async (pubkeys: string[]): Promise<void> => {
        if (!pubkeys || pubkeys.length === 0) {
            return;
        }

        await overlay.loadProfilesByPubkeys(pubkeys);
    };

    const openReferencedEventFromFeed = (eventId: string): void => {
        if (!eventId) {
            return;
        }

        void followingFeed.openThread(eventId);
    };

    const resolveEventReferences = async (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ): Promise<Record<string, NostrEvent>> => {
        if (!eventIds || eventIds.length === 0) {
            return {};
        }

        const loadedEvents = await overlay.loadEventsByIds(eventIds, options);
        if (Object.keys(loadedEvents).length === 0) {
            return {};
        }

        setEventReferencesById((current) => ({
            ...current,
            ...loadedEvents,
        }));

        return loadedEvents;
    };

    const clearFollowingFeedHashtagFilter = (): void => {
        if (!activeAgoraHashtag) {
            return;
        }

        navigate('/agora');
    };

    const openRelaysPage = (): void => {
        navigate('/relays');
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
            streetLabelsZoomLevel: enabled
                ? Math.min(
                    currentSettings.streetLabelsZoomLevel,
                    Math.max(1, Math.min(20, Math.floor(mapBridge?.getZoom() ?? 1)))
                )
                : currentSettings.streetLabelsZoomLevel,
        }));
        toast.success(enabled ? 'Etiquetas de calles activadas' : 'Etiquetas de calles desactivadas', { duration: 1800 });
    };

    const setSpecialMarkersQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            specialMarkersEnabled: enabled,
        }));
        toast.success(enabled ? 'Iconos especiales activados' : 'Iconos especiales desactivados', { duration: 1800 });
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
        toast.success(enabled ? 'Coches activados' : 'Coches desactivados', { duration: 1800 });
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

    const handleLogout = async (): Promise<void> => {
        await overlay.logoutSession?.();
        setEasterEggProgress({ discoveredIds: [] });
        setZapSettings(loadZapSettings());
        setActiveEasterEgg(null);
        navigate('/');
    };

    return (
        <div
            className="nostr-overlay-shell"
            style={{ width: (showLoginGate || isMobile) ? '100vw' : `${sidebarOpen ? OVERLAY_SIDEBAR_EXPANDED_WIDTH : OVERLAY_SIDEBAR_COLLAPSED_WIDTH}px` }}
        >
            {!showLoginGate ? (
                <OverlaySidebar
                    open={sidebarOpen}
                    onOpenChange={setSidebarOpen}
                    {...(overlay.authSession ? { authSession: overlay.authSession } : {})}
                    {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                    {...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {})}
                    canAccessDirectMessages={canAccessDirectMessages}
                    canAccessSocialNotifications={canAccessSocialNotifications}
                    canAccessFollowingFeed={canAccessFollowingFeed}
                    chatHasUnread={chatState.hasUnreadGlobal}
                    notificationsHasUnread={socialState.hasUnread}
                    followingFeedHasUnread={followingFeedHasUnread}
                    onOpenMap={() => navigate('/')}
                    onOpenCityStats={() => navigate('/estadisticas')}
                    onOpenChat={openChatList}
                    onOpenRelays={openRelaysPage}
                    onOpenNotifications={openNotifications}
                    onOpenFollowingFeed={openFollowingFeed}
                    onOpenGlobalSearch={openGlobalUserSearch}
                    onOpenSettings={openSettingsPage}
                    onLogout={handleLogout}
                    onCopyOwnerNpub={copyOwnerIdentifier}
                    onLocateOwner={locateOwnerOnMap}
                    onViewOwnerDetails={() => {
                        if (overlay.ownerPubkey) {
                            overlay.openActiveProfile(overlay.ownerPubkey, overlay.ownerBuildingIndex);
                        }
                    }}
                    missionsDiscoveredCount={discoveredMissionsCount}
                    missionsTotal={EASTER_EGG_MISSIONS.length}
                    relaysConnectedCount={relayConnectionSummary.connectedRelays}
                    relaysTotal={relayConnectionSummary.totalRelays}
                    onOpenMissions={() => navigate('/descubre')}
                >
                    <SocialSidebar
                        {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                        {...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {})}
                        follows={overlay.follows}
                        profiles={overlay.profiles}
                        followers={overlay.followers}
                        followerProfiles={overlay.followerProfiles}
                        followersLoading={overlay.followersLoading}
                        {...(overlay.selectedPubkey ? { selectedFollowingPubkey: overlay.selectedPubkey } : {})}
                        onSelectFollowing={selectSidebarPerson}
                        onLocateFollowing={locateFollowingOnMap}
                        {...(canAccessDirectMessages ? { onMessagePerson: openDmFromContextMenu } : {})}
                        {...(overlay.canWrite ? { onFollowPerson: followPerson } : {})}
                        onViewPersonDetails={(pubkey) => overlay.openActiveProfile(pubkey)}
                        zapAmounts={zapSettings.amounts}
                        onConfigureZapAmounts={() => openSettingsPage('zaps')}
                        onCopyOwnerNpub={copyOwnerIdentifier}
                        verificationByPubkey={verificationByPubkey}
                    />
                </OverlaySidebar>
            ) : null}

            {isMapRoute ? (
                <MapZoomControls
                    mapBridge={mapBridge}
                    onRegenerateMap={overlay.regenerateMap}
                />
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
                                {...(canAccessDirectMessages
                                    ? { onSendMessage: () => openDmFromContextMenu(buildingContextMenu.pubkey) }
                                    : {})}
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

            {mapLoaderText && !showLoginGate ? (
                <div className="nostr-map-loader-overlay" role="status" aria-live="polite">
                    <div className="nostr-map-loader-card">
                        <Spinner />
                        <p className="nostr-map-loader-text">{mapLoaderText}</p>
                    </div>
                </div>
            ) : null}

            <Toaster richColors position="bottom-center" closeButton={false} />

            <Routes>
                {showLoginGate ? (
                    <>
                        <Route path="/login" element={null} />
                        <Route path="*" element={<Navigate to="/login" replace />} />
                    </>
                ) : (
                    <>
                <Route
                    path="/agora"
                    element={(
                        <FollowingFeedSurface
                            items={followingFeed.items}
                            hasFollows={followingFeed.hasFollows}
                            profilesByPubkey={richContentProfilesByPubkey}
                            engagementByEventId={followingFeed.engagementByEventId}
                            {...(followingFeed.activeHashtag ? { activeHashtag: followingFeed.activeHashtag } : {})}
                            {...(followingFeed.activeHashtag ? { onClearHashtag: clearFollowingFeedHashtagFilter } : {})}
                            onSelectHashtag={selectFollowingFeedHashtag}
                            onSelectProfile={openMentionedProfile}
                            onResolveProfiles={resolveMentionProfiles}
                            onSelectEventReference={openReferencedEventFromFeed}
                            onResolveEventReferences={resolveEventReferences}
                            eventReferencesById={eventReferencesById}
                            onCopyNoteId={(noteId) => {
                                void copyNoteIdentifier(noteId);
                            }}
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
                            {...(!overlay.ownerPubkey
                                ? { disabledReason: 'Inicia sesión para enviar mensajes privados.' }
                                : !overlay.canDirectMessages
                                    ? { disabledReason: 'Tu sesión no permite mensajería privada (requiere firma y NIP-44).' }
                                    : {})}
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
                    path="/relays"
                    element={(
                        <RelaysRoute
                            {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                            suggestedRelays={overlay.suggestedRelays}
                            suggestedRelaysByType={overlay.suggestedRelaysByType}
                            onRelaySettingsChange={setRelaySettingsSnapshot}
                        />
                    )}
                />
                <Route
                    path="/relays/detail"
                    element={(
                        <RelayDetailRoute
                            {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                            suggestedRelays={overlay.suggestedRelays}
                            suggestedRelaysByType={overlay.suggestedRelaysByType}
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
                            {...(canAccessDirectMessages ? { onMessageUser: openDmFromContextMenu } : {})}
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
                            {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                            zapSettings={zapSettings}
                            onZapSettingsChange={setZapSettings}
                            onClose={() => navigate('/')}
                        />
                    )}
                    >
                        <Route index element={<Navigate to="ui" replace />} />
                        <Route path="ui" element={<SettingsUiRoute />} />
                        <Route path="shortcuts" element={<SettingsShortcutsRoute />} />
                        <Route path="zaps" element={<SettingsZapsRoute />} />
                        <Route path="about" element={<SettingsAboutRoute />} />
                        <Route path="advanced" element={<SettingsAdvancedRoute />} />
                        <Route path="*" element={<Navigate to="ui" replace />} />
                    </Route>
                    <Route path="/settings/relays" element={<Navigate to="/relays" replace />} />
                    <Route path="/settings/relays/detail" element={<Navigate to={`/relays/detail${location.search}`} replace />} />
                    <Route path="/settings/:view" element={<Navigate to="/settings/ui" replace />} />
                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="/" element={null} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                )}
            </Routes>

            <MapPresenceLayer
                mapBridge={mapBridge}
                occupancyByBuildingIndex={overlay.occupancyByBuildingIndex}
                discoveredEasterEggIds={easterEggProgress.discoveredIds}
                profiles={overlay.profiles}
                {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                {...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {})}
                {...(overlay.ownerBuildingIndex !== undefined ? { ownerBuildingIndex: overlay.ownerBuildingIndex } : {})}
                occupiedLabelsZoomLevel={uiSettings.occupiedLabelsZoomLevel}
                alwaysVisiblePubkeys={overlay.alwaysVisiblePubkeys}
                specialMarkersEnabled={uiSettings.specialMarkersEnabled}
            />

            {overlay.activeProfilePubkey ? (
                <OccupantProfileDialog
                    {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                    pubkey={overlay.activeProfilePubkey}
                    {...(overlay.activeProfile ? { profile: overlay.activeProfile } : {})}
                    followsCount={activeProfileData.followsCount}
                    followersCount={activeProfileData.followersCount}
                    statsLoading={activeProfileData.statsLoading}
                    {...(activeProfileData.statsError ? { statsError: activeProfileData.statsError } : {})}
                    posts={activeProfileData.posts}
                    postsLoading={activeProfileData.postsLoading}
                    {...(activeProfileData.postsError ? { postsError: activeProfileData.postsError } : {})}
                    hasMorePosts={activeProfileData.hasMorePosts}
                    follows={activeProfileData.follows}
                    followers={activeProfileData.followers}
                    networkProfiles={activeProfileData.networkProfiles}
                    profilesByPubkey={richContentProfilesByPubkey}
                    networkLoading={activeProfileData.networkLoading}
                    {...(activeProfileData.networkError ? { networkError: activeProfileData.networkError } : {})}
                    {...(activeProfileVerification !== undefined
                        ? { verification: activeProfileVerification }
                        : {})}
                    onLoadMorePosts={activeProfileData.loadMorePosts}
                    onSelectHashtag={selectProfilePostHashtag}
                    onSelectProfile={openMentionedProfile}
                    ownerFollows={overlay.follows}
                    relaySuggestionsByType={activeProfileData.relaySuggestionsByType}
                    onAddRelaySuggestion={addRelaySuggestionToSettings}
                    onAddAllRelaySuggestions={addAllRelaySuggestionsToSettings}
                    {...(overlay.canWrite ? { onFollowProfile: followPerson } : {})}
                    onResolveProfiles={resolveMentionProfiles}
                    onResolveEventReferences={resolveEventReferences}
                    eventReferencesById={eventReferencesById}
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

            {showLoginGate ? (
                <LoginGateScreen
                    authSession={overlay.authSession}
                    savedLocalAccount={overlay.savedLocalAccount}
                    disabled={loginDisabled || !sessionRestorationResolved}
                    mapLoaderText={mapLoaderText}
                    restoringSession={!sessionRestorationResolved}
                    showLogout={Boolean(overlay.authSession)}
                    onLogout={handleLogout}
                    onStartSession={overlay.startSession}
                />
            ) : null}
        </div>
    );
}
