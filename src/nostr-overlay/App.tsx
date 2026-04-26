import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { verifyEvent } from 'nostr-tools/pure';
import { Navigate, Route, Routes } from 'react-router';
import {
    DEFAULT_STREET_LABELS_ZOOM_LEVEL,
    getDefaultUiSettings,
    loadUiSettings,
    saveUiSettings,
    type UiTheme,
    type UiSettingsState,
} from '../nostr/ui-settings';
import { loadZapSettings, type ZapSettingsState } from '../nostr/zap-settings';
import { loadWalletSettings, saveWalletSettings } from '../nostr/wallet-settings';
import {
    addWalletActivity,
    loadWalletActivity,
    markWalletActivityFailed,
    markWalletActivitySucceeded,
    saveWalletActivity,
} from '../nostr/wallet-activity';
import type { WalletActivityState, WalletSettingsState } from '../nostr/wallet-types';
import { detectWebLnProvider, resolveWebLnCapabilities } from '../nostr/webln';
import { requestEventZapInvoice } from '../nostr/zaps';
import { requestProfileZapInvoice } from '../nostr/zaps';
import { profileHasZapEndpoint } from '../nostr/zaps';
import { createNwcClient, createNwcRelayIo, parseNwcConnectionUri, resolveNwcEncryptionMode, resolveNwcInfoCapabilities } from '../nostr/nwc';
import { encodeHexToNpub } from '../nostr/npub';
import { MapPresenceLayer } from './components/MapPresenceLayer';
import { OccupantProfileDialog } from './components/OccupantProfileDialog';
import { EasterEggDialog } from './components/EasterEggDialog';
import { EasterEggFireworks } from './components/EasterEggFireworks';
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
import { SocialComposeDialog } from './components/SocialComposeDialog';
import { SettingsPage } from './components/SettingsPage';
import { UserSearchPage } from './components/UserSearchPage';
import { WalletPage } from './components/WalletPage';
import { RelayDetailRoute } from './components/RelayDetailRoute';
import { RelaysRoute } from './components/RelaysRoute';
import { LoginGateScreen } from './components/LoginGateScreen';
import { SettingsAboutRoute } from './components/settings-routes/SettingsAboutRoute';
import { SettingsAdvancedRoute } from './components/settings-routes/SettingsAdvancedRoute';
import { SettingsShortcutsRoute } from './components/settings-routes/SettingsShortcutsRoute';
import { SettingsZapsRoute } from './components/settings-routes/SettingsZapsRoute';
import { UiSettingsDialog } from './components/UiSettingsDialog';
import { PersonContextMenuItems } from './components/PersonContextMenuItems';
import { useNostrOverlay, type MapLoaderStage } from './hooks/useNostrOverlay';
import { useNip05Verification } from './hooks/useNip05Verification';
import { useOverlaySocialFeedController } from './controllers/use-overlay-social-feed-controller';
import { useOverlayNotificationsController } from './controllers/use-overlay-notifications-controller';
import { useOverlayDmController } from './controllers/use-overlay-dm-controller';
import { useEasterEggDiscoveryController } from './hooks/useEasterEggDiscoveryController';
import { useFollowingFeedEngagementQuery } from './query/following-feed.query';
import { applyEngagementDeltas, createEmptyEngagementByEventIds } from './query/following-feed.selectors';
import { useActiveProfileQuery } from './query/active-profile.query';
import type { MentionDraft } from './mention-serialization';
import type { MapBridge, OccupiedBuildingContextPayload } from './map-bridge';
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
import { useRelayConnectionSummary } from './hooks/useRelayConnectionSummary';
import { useOverlayTheme } from './hooks/useOverlayTheme';
import { resolveNostrCityMapPreset } from './map-colour-schemes';
import { OverlayAppShell } from './shell/OverlayAppShell';
import { useMapBridgeController } from './shell/use-map-bridge-controller';
import { normalizeHashtag, useOverlayRouteState } from './shell/use-overlay-route-state';
import type { NoteCardModel } from './components/note-card-model';
import type { SocialEngagementByEventId } from '../nostr/social-feed-service';
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
import { translate } from '@/i18n/translate';
import type { OverlayServices } from './services/overlay-services';

interface AppProps {
    mapBridge: MapBridge | null;
    services: OverlayServices;
}

interface OccupiedBuildingContextMenuState extends OccupiedBuildingContextPayload {
    nonce: number;
}

interface PendingZapIntent {
    targetPubkey: string;
    amount: number;
    eventId?: string;
    eventKind?: number;
    originPath: string;
    phase: 'navigating' | 'ready' | 'paused';
}

interface ZapIntentInput {
    targetPubkey: string;
    amount: number;
    eventId?: string;
    eventKind?: number;
}

type ZapExecutionResult = 'success' | 'retryable_failure' | 'definitive_failure';

interface OptimisticZapEntry {
    baselineZaps: number;
    baselineZapSats: number;
    deltaZaps: number;
    deltaZapSats: number;
}

function applyOptimisticZapMetrics(
    baseByEventId: SocialEngagementByEventId,
    optimisticByEventId: Record<string, OptimisticZapEntry>,
): SocialEngagementByEventId {
    const eventIds = [...new Set([...Object.keys(baseByEventId), ...Object.keys(optimisticByEventId)])];
    if (eventIds.length === 0) {
        return baseByEventId;
    }

    const deltaByEventId: SocialEngagementByEventId = {};
    for (const eventId of Object.keys(optimisticByEventId)) {
        const optimistic = optimisticByEventId[eventId];
        if (!optimistic) {
            continue;
        }

        const base = baseByEventId[eventId] ?? {
            replies: 0,
            reposts: 0,
            reactions: 0,
            zaps: 0,
            zapSats: 0,
        };
        const hasCaughtUp = base.zaps >= optimistic.baselineZaps + optimistic.deltaZaps
            && base.zapSats >= optimistic.baselineZapSats + optimistic.deltaZapSats;
        if (hasCaughtUp) {
            continue;
        }

        deltaByEventId[eventId] = {
            replies: 0,
            reposts: 0,
            reactions: 0,
            zaps: optimistic.deltaZaps,
            zapSats: optimistic.deltaZapSats,
        };
    }

    return applyEngagementDeltas({
        eventIds,
        baseByEventId,
        deltaByEventId,
    });
}

interface SocialComposeState {
    mode: 'post' | 'quote';
    quoteTarget?: NoteCardModel;
}

function mapLoaderStageLabel(stage: MapLoaderStage | null, language: UiSettingsState['language']): string | null {
    if (stage === 'connecting_relay') {
        return translate(language, 'app.loader.connectingRelay');
    }

    if (stage === 'fetching_data') {
        return translate(language, 'app.loader.fetchingData');
    }

    if (stage === 'building_map') {
        return translate(language, 'app.loader.buildingMap');
    }

    return null;
}

export function App({ mapBridge, services }: AppProps) {
    const {
        navigate,
        location,
        activeAgoraHashtag,
        isMapRoute,
        isAgoraRoute,
        isChatsRoute,
        isNotificationsRoute,
        isUiSettingsDialogOpen,
        openUiSettingsDialog,
        closeUiSettingsDialog,
        openSettingsPage,
        openSettingsDestination,
        openGlobalUserSearch,
        closeGlobalUserSearch,
    } = useOverlayRouteState();
    const overlay = useNostrOverlay({ mapBridge, services });
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
    const [walletSettings, setWalletSettings] = useState<WalletSettingsState>(() => loadWalletSettings());
    const [walletActivity, setWalletActivity] = useState<WalletActivityState>(() => loadWalletActivity());
    const [walletNwcUriInput, setWalletNwcUriInput] = useState('');
    const [pendingZapIntent, setPendingZapIntent] = useState<PendingZapIntent | null>(null);
    const [optimisticZapByEventId, setOptimisticZapByEventId] = useState<Record<string, OptimisticZapEntry>>({});
    const [resumingZap, setResumingZap] = useState(false);
    const [socialComposeState, setSocialComposeState] = useState<SocialComposeState | null>(null);
    const [isSubmittingSocialCompose, setIsSubmittingSocialCompose] = useState(false);
    const userSearchRelaySetKey = useMemo(
        () => [...new Set(relaySettingsSnapshot.byType.search)].sort((left, right) => left.localeCompare(right)).join('|'),
        [relaySettingsSnapshot.byType.search]
    );
    const shouldAutoRestoreRememberedWebLnRef = useRef(
        walletSettings.activeConnection?.method === 'webln' && walletSettings.activeConnection.restoreState === 'reconnect-required'
    );

    const fetchNwcInfo = async (connection: {
        walletServicePubkey: string;
        relays: string[];
    }): Promise<{ capabilities: ReturnType<typeof resolveNwcInfoCapabilities>; encryption: 'nip44_v2' | 'nip04' }> => {
        const client = services.createClient(connection.relays);

        await client.connect();
        const infoEvent = await client.fetchLatestReplaceableEvent(connection.walletServicePubkey, 13194);
        if (!infoEvent) {
            throw new Error('NWC info event was not found');
        }
        if (!verifyEvent(infoEvent as Parameters<typeof verifyEvent>[0])) {
            throw new Error('NWC info event signature is invalid');
        }

        const capabilities = resolveNwcInfoCapabilities(infoEvent.content);
        if (!capabilities.payInvoice) {
            throw new Error('NWC wallet does not support pay_invoice');
        }

        return {
            capabilities,
            encryption: resolveNwcEncryptionMode(infoEvent.tags),
        };
    };

    const withNwcClient = async <T,>(
        connection: Extract<NonNullable<WalletSettingsState['activeConnection']>, { method: 'nwc' }>,
        operation: (client: ReturnType<typeof createNwcClient>) => Promise<T>
    ): Promise<T> => {
        const io = createNwcRelayIo(connection.relays);
        const client = createNwcClient({ connection, io });
        try {
            return await operation(client);
        } finally {
            io.close?.();
        }
    };

    const isWalletReadyForPayments = (connection: WalletSettingsState['activeConnection']): boolean => {
        if (!connection?.capabilities.payInvoice) {
            return false;
        }

        if (connection.method === 'webln' || connection.method === 'nwc') {
            return connection.restoreState === 'connected';
        }

        return true;
    };
    const [buildingContextMenu, setBuildingContextMenu] = useState<OccupiedBuildingContextMenuState | null>(null);
    const [eventReferencesById, setEventReferencesById] = useState<Record<string, NostrEvent>>({});
    const isMobile = useIsMobile();
    const contextMenuTriggerRef = useRef<HTMLSpanElement | null>(null);
    const contextMenuNonceRef = useRef(0);
    const lastTrafficParticlesCountRef = useRef(
        Math.max(
            1,
            uiSettings.trafficParticlesCount > 0
                ? uiSettings.trafficParticlesCount
                : getDefaultUiSettings().trafficParticlesCount
        )
    );
    const loginDisabled = overlay.status !== 'idle' && overlay.status !== 'success' && overlay.status !== 'error';
    const mapLoaderText = mapLoaderStageLabel(overlay.mapLoaderStage, uiSettings.language);
    const sessionRestorationResolved = overlay.sessionRestorationResolved;

    const isAppReady = Boolean(overlay.authSession) && overlay.status === 'success' && !overlay.authSession?.locked;
    const showLoginGate = !sessionRestorationResolved || !isAppReady;
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
    const mapBridgeController = useMapBridgeController({
        mapBridge,
        viewportInsetLeft: isMobile
            ? 0
            : sidebarOpen
                ? OVERLAY_SIDEBAR_EXPANDED_WIDTH
                : OVERLAY_SIDEBAR_COLLAPSED_WIDTH,
        showLoginGate,
        streetLabelsEnabled: uiSettings.streetLabelsEnabled,
        streetLabelsZoomLevel: uiSettings.streetLabelsZoomLevel,
        streetLabelUsernames,
        trafficParticlesCount: uiSettings.trafficParticlesCount,
        trafficParticlesSpeed: uiSettings.trafficParticlesSpeed,
        verifiedBuildingIndexes,
    });
    const {
        easterEggProgress,
        activeEasterEgg,
        easterEggCelebrationNonce,
        closeActiveEasterEgg,
        resetEasterEggProgress,
    } = useEasterEggDiscoveryController({
        mapBridge,
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
    });
    const discoveredMissionsCount = useMemo(
        () => new Set(easterEggProgress.discoveredIds).size,
        [easterEggProgress.discoveredIds]
    );

    useEffect(() => {
        setZapSettings(loadZapSettings(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : undefined));
    }, [overlay.ownerPubkey]);

    useEffect(() => {
        if (uiSettings.trafficParticlesCount > 0) {
            lastTrafficParticlesCountRef.current = uiSettings.trafficParticlesCount;
        }
    }, [uiSettings.trafficParticlesCount]);

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

    const {
        chatState,
        canAccessDirectMessages,
        chatPinnedConversationId,
        chatActiveConversationId,
        chatComposerFocusKey,
        setChatPinnedConversationId,
        setChatComposerFocusKey,
    } = useOverlayDmController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        canDirectMessages: overlay.canDirectMessages,
        isChatsRoute,
        locationSearch: location.search,
        navigate,
        service: overlay.directMessagesService,
    });
    const {
        socialState,
        canAccessSocialNotifications,
    } = useOverlayNotificationsController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        canWrite: overlay.canWrite,
        isNotificationsRoute,
        service: overlay.socialNotificationsService,
    });
    const handleFollowPerson = useCallback(async (pubkey: string): Promise<void> => {
        if (!pubkey || !overlay.canWrite) {
            return;
        }

        try {
            await overlay.followPerson(pubkey);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo actualizar el seguimiento de esta cuenta';
            toast.error(message, { duration: 2200 });
        }
    }, [overlay.canWrite, overlay.followPerson]);
    const socialFeed = useOverlaySocialFeedController({
        ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
        follows: overlay.follows,
        ...(activeAgoraHashtag ? { activeAgoraHashtag } : {}),
        isAgoraRoute,
        canWrite: overlay.canWrite,
        service: overlay.socialFeedService,
        ...((overlay.socialPublisher ?? overlay.writeGateway) ? { writeGateway: overlay.socialPublisher ?? overlay.writeGateway } : {}),
        onFollowPerson: handleFollowPerson,
    });
    const followingFeed = socialFeed.followingFeed;
    const followPerson = socialFeed.followPerson;
    const activeProfilePostEventIds = useMemo(
        () => activeProfileData.posts.map((post) => post.id),
        [activeProfileData.posts]
    );
    const activeProfileEngagementQuery = useFollowingFeedEngagementQuery({
        eventIds: activeProfilePostEventIds,
        service: overlay.socialFeedService,
        enabled: Boolean(overlay.activeProfilePubkey),
    });
    const activeProfileEngagementByEventId = useMemo(() => {
        const fallback = createEmptyEngagementByEventIds(activeProfilePostEventIds);
        if (!activeProfileEngagementQuery.data) {
            return fallback;
        }

        return {
            ...fallback,
            ...activeProfileEngagementQuery.data,
        };
    }, [activeProfileEngagementQuery.data, activeProfilePostEventIds]);
    const activeProfileEngagementWithOptimisticByEventId = useMemo(
        () => applyOptimisticZapMetrics(activeProfileEngagementByEventId, optimisticZapByEventId),
        [activeProfileEngagementByEventId, optimisticZapByEventId],
    );
    const followingFeedEngagementByEventId = useMemo(
        () => applyOptimisticZapMetrics(followingFeed.engagementByEventId, optimisticZapByEventId),
        [followingFeed.engagementByEventId, optimisticZapByEventId],
    );
    const optimisticZapBaseByEventId = useMemo(
        () => ({
            ...activeProfileEngagementByEventId,
            ...followingFeed.engagementByEventId,
        }),
        [activeProfileEngagementByEventId, followingFeed.engagementByEventId],
    );
    useEffect(() => {
        setOptimisticZapByEventId((current) => {
            let changed = false;
            const next: Record<string, OptimisticZapEntry> = {};

            for (const [eventId, optimistic] of Object.entries(current)) {
                const base = optimisticZapBaseByEventId[eventId] ?? {
                    replies: 0,
                    reposts: 0,
                    reactions: 0,
                    zaps: 0,
                    zapSats: 0,
                };
                const hasCaughtUp = base.zaps >= optimistic.baselineZaps + optimistic.deltaZaps
                    && base.zapSats >= optimistic.baselineZapSats + optimistic.deltaZapSats;

                if (hasCaughtUp) {
                    changed = true;
                    continue;
                }

                next[eventId] = optimistic;
            }

            return changed ? next : current;
        });
    }, [optimisticZapBaseByEventId]);
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

    const canAccessFollowingFeed = socialFeed.canAccessFollowingFeed;
    const relayStatusTargets = relaySettingsSnapshot.relays;
    const relayConnectionSummary = useRelayConnectionSummary(relayStatusTargets, {
        enabled: relayStatusTargets.length > 0,
        maxConcurrentProbes: 3,
    });
    const resolvedOverlayTheme = useOverlayTheme(uiSettings.theme as UiTheme);
    const followingFeedHasUnread = socialFeed.followingFeedHasUnread;
    const canSendChatMessages = canAccessDirectMessages;
    const activeProfileVerification = overlay.activeProfilePubkey
        ? verificationByPubkey[overlay.activeProfilePubkey]
        : undefined;

    useEffect(() => {
        mapBridge?.setColourScheme?.(resolveNostrCityMapPreset(resolvedOverlayTheme));
    }, [mapBridge, resolvedOverlayTheme]);

    useEffect(() => {
        setRelaySettingsSnapshot(loadRelaySettings(
            relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined
        ));
    }, [relaySettingsOwnerPubkey]);

    useEffect(() => {
        setEventReferencesById({});
    }, [overlay.ownerPubkey]);

    useEffect(() => {
        const nextWalletSettings = loadWalletSettings(
            overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : undefined
        );
        shouldAutoRestoreRememberedWebLnRef.current = Boolean(
            nextWalletSettings.activeConnection?.method === 'webln'
            && nextWalletSettings.activeConnection.restoreState === 'reconnect-required'
        );
        setWalletSettings(nextWalletSettings);
        setWalletActivity(loadWalletActivity(
            overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : undefined
        ));
    }, [overlay.ownerPubkey]);

    useEffect(() => {
        if (!shouldAutoRestoreRememberedWebLnRef.current) {
            return;
        }
        if (walletSettings.activeConnection?.method !== 'webln' || walletSettings.activeConnection.restoreState !== 'reconnect-required') {
            shouldAutoRestoreRememberedWebLnRef.current = false;
            return;
        }

        shouldAutoRestoreRememberedWebLnRef.current = false;
        void connectWebLnWallet({ silent: true });
    }, [walletSettings.activeConnection]);

    const walletStorageOptions = overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : undefined;

    const persistWalletSettings = (nextState: WalletSettingsState): WalletSettingsState => {
        const saved = saveWalletSettings(nextState, walletStorageOptions);
        setWalletSettings(saved);
        return saved;
    };

    const persistWalletActivity = (nextState: WalletActivityState): WalletActivityState => {
        const saved = saveWalletActivity(nextState, walletStorageOptions);
        setWalletActivity(saved);
        return saved;
    };

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

        mapBridgeController.focusBuilding(overlay.ownerBuildingIndex);
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

        mapBridgeController.focusBuilding(buildingIndex);
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

    const openFollowingFeed = (): void => {
        if (!canAccessFollowingFeed) {
            return;
        }

        navigate('/agora');
    };

    const openPublishComposer = (): void => {
        if (!overlay.canWrite) {
            return;
        }

        setSocialComposeState({ mode: 'post' });
    };

    const openQuoteComposer = (note: NoteCardModel): void => {
        if (!overlay.canWrite) {
            return;
        }

        setSocialComposeState({ mode: 'quote', quoteTarget: note });
    };

    const closeSocialCompose = (): void => {
        if (isSubmittingSocialCompose) {
            return;
        }

        setSocialComposeState(null);
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

    const openThreadFromProfileDialog = (eventId: string): void => {
        if (!eventId) {
            return;
        }

        overlay.closeActiveProfileDialog();
        openFollowingFeed();
        void followingFeed.openThread(eventId);
    };

    const handleToggleRepost = useCallback(async (input: Parameters<typeof followingFeed.toggleRepost>[0]): Promise<boolean> => {
        const wasActive = Boolean(followingFeed.repostByEventId[input.eventId]);
        const succeeded = await followingFeed.toggleRepost(input);

        if (succeeded) {
            toast.success(wasActive ? 'Repost eliminado' : 'Repost publicado', { duration: 1800 });
            return true;
        }

        toast.error(wasActive ? 'No se pudo eliminar el repost' : 'No se pudo publicar el repost', { duration: 2200 });
        return false;
    }, [followingFeed.repostByEventId, followingFeed.toggleRepost]);

    const submitSocialCompose = useCallback(async (content: MentionDraft): Promise<void> => {
        if (!socialComposeState) {
            return;
        }

        setIsSubmittingSocialCompose(true);
        try {
            if (socialComposeState.mode === 'post') {
                const succeeded = await followingFeed.publishPost(content);
                if (succeeded) {
                    toast.success('Publicacion enviada', { duration: 1800 });
                    setSocialComposeState(null);
                    return;
                }

                toast.error('No se pudo publicar la nota', { duration: 2200 });
                return;
            }

            const quoteTarget = socialComposeState.quoteTarget;
            if (!quoteTarget) {
                toast.error('No se pudo publicar la cita', { duration: 2200 });
                return;
            }

            const succeeded = await followingFeed.publishQuote({
                targetEventId: quoteTarget.id,
                targetPubkey: quoteTarget.pubkey,
                content,
            });

            if (succeeded) {
                toast.success('Cita publicada', { duration: 1800 });
                setSocialComposeState(null);
                return;
            }

            toast.error('No se pudo publicar la cita', { duration: 2200 });
        } finally {
            setIsSubmittingSocialCompose(false);
        }
    }, [followingFeed.publishPost, followingFeed.publishQuote, socialComposeState]);

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

    const openNotificationThread = (eventId: string): void => {
        if (!eventId) {
            return;
        }

        openFollowingFeed();
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

    const setStreetLabelsQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            streetLabelsEnabled: enabled,
            streetLabelsZoomLevel: enabled
                ? Math.min(
                    currentSettings.streetLabelsZoomLevel,
                    Math.max(
                        DEFAULT_STREET_LABELS_ZOOM_LEVEL,
                        Math.max(1, Math.min(20, Math.floor(mapBridge?.getZoom() ?? 1)))
                    )
                )
                : currentSettings.streetLabelsZoomLevel,
        }));
        toast.success(translate(uiSettings.language, enabled ? 'app.toast.streetLabelsEnabled' : 'app.toast.streetLabelsDisabled'), { duration: 1800 });
    };

    const setSpecialMarkersQuickToggle = (enabled: boolean): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            specialMarkersEnabled: enabled,
        }));
        toast.success(translate(uiSettings.language, enabled ? 'app.toast.specialIconsEnabled' : 'app.toast.specialIconsDisabled'), { duration: 1800 });
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
        toast.success(translate(uiSettings.language, enabled ? 'app.toast.carsEnabled' : 'app.toast.carsDisabled'), { duration: 1800 });
    };

    const setAgoraFeedLayout = (layout: UiSettingsState['agoraFeedLayout']): void => {
        setUiSettings((currentSettings) => saveUiSettings({
            ...currentSettings,
            agoraFeedLayout: layout,
        }));
    };

    const persistUiSettings = (nextState: UiSettingsState): void => {
        setUiSettings(saveUiSettings(nextState));
    };

    const openDmFromContextMenu = async (pubkey: string): Promise<void> => {
        if (!canAccessDirectMessages) {
            return;
        }

        overlay.closeActiveProfileDialog();
        openChatConversation(pubkey, true);
    };

    const recordOptimisticZap = useCallback((input: { eventId?: string; amount: number }) => {
        const eventId = input.eventId;
        if (!eventId) {
            return;
        }

        setOptimisticZapByEventId((current) => {
            const base = optimisticZapBaseByEventId[eventId] ?? {
                replies: 0,
                reposts: 0,
                reactions: 0,
                zaps: 0,
                zapSats: 0,
            };
            const existing = current[eventId];

            return {
                ...current,
                [eventId]: {
                    baselineZaps: existing?.baselineZaps ?? base.zaps,
                    baselineZapSats: existing?.baselineZapSats ?? base.zapSats,
                    deltaZaps: (existing?.deltaZaps ?? 0) + 1,
                    deltaZapSats: (existing?.deltaZapSats ?? 0) + input.amount,
                },
            };
        });
    }, [optimisticZapBaseByEventId]);

    const executeZapIntent = useCallback(async (
        input: ZapIntentInput,
        connectionOverride: WalletSettingsState['activeConnection'] = walletSettings.activeConnection
    ): Promise<ZapExecutionResult> => {
        if (!connectionOverride) {
            return 'retryable_failure';
        }

        if (!overlay.writeGateway) {
            toast.error(translate(uiSettings.language, 'app.toast.zapUnavailable'), { duration: 2200 });
            return 'definitive_failure';
        }

        const profile = overlay.profiles[input.targetPubkey]
            ?? overlay.followerProfiles[input.targetPubkey]
            ?? (overlay.ownerPubkey === input.targetPubkey ? overlay.ownerProfile : undefined);
        const writeRelays = [...new Set([
            ...relaySettingsSnapshot.byType.nip65Both,
            ...relaySettingsSnapshot.byType.nip65Write,
        ])];
        if (writeRelays.length === 0) {
            toast.error(translate(uiSettings.language, 'app.toast.zapUnavailable'), { duration: 2200 });
            return 'definitive_failure';
        }
        const activityId = `zap-${input.eventId ?? input.targetPubkey}-${Date.now()}`;
        persistWalletActivity(addWalletActivity(walletActivity, {
            id: activityId,
            status: 'pending',
            actionType: 'zap-payment',
            amountMsats: input.amount * 1000,
            createdAt: Date.now(),
            targetType: input.eventId ? 'event' : 'profile',
            targetId: input.eventId ?? input.targetPubkey,
            provider: connectionOverride.method,
        }));

        try {
            const invoice = input.eventId
                ? await requestEventZapInvoice({
                    amountSats: input.amount,
                    eventId: input.eventId,
                    ...(typeof input.eventKind === 'number' ? { eventKind: input.eventKind } : {}),
                    profilePubkey: input.targetPubkey,
                    profile,
                    relays: writeRelays,
                    writeGateway: overlay.writeGateway,
                })
                : await requestProfileZapInvoice({
                    amountSats: input.amount,
                    profilePubkey: input.targetPubkey,
                    profile,
                    relays: writeRelays,
                    writeGateway: overlay.writeGateway,
                });
            try {
                if (connectionOverride.method === 'webln') {
                    const provider = detectWebLnProvider();
                    if (!provider?.sendPayment) {
                        throw new Error('WebLN sendPayment is not available');
                    }
                    await provider.sendPayment(invoice);
                } else {
                    await withNwcClient(connectionOverride, async (client) => {
                        await client.payInvoice(invoice);
                    });
                }
                persistWalletActivity(markWalletActivitySucceeded(loadWalletActivity(walletStorageOptions), activityId));
                recordOptimisticZap({ ...(input.eventId ? { eventId: input.eventId } : {}), amount: input.amount });
                toast.success('Pago enviado.', { duration: 1800 });
                return 'success';
            } catch {
                persistWalletActivity(markWalletActivityFailed(loadWalletActivity(walletStorageOptions), activityId, 'No se pudo completar el pago.'));
                toast.error('No se pudo completar el pago.', { duration: 2200 });
                return 'retryable_failure';
            }
        } catch {
            persistWalletActivity(markWalletActivityFailed(loadWalletActivity(walletStorageOptions), activityId, 'No se puede enviar este zap.'));
            toast.error('No se puede enviar este zap.', { duration: 2200 });
            return 'definitive_failure';
        }
    }, [walletSettings.activeConnection, overlay.writeGateway, overlay.profiles, overlay.followerProfiles, overlay.ownerPubkey, overlay.ownerProfile, relaySettingsSnapshot.byType.nip65Both, relaySettingsSnapshot.byType.nip65Write, walletActivity, walletStorageOptions, recordOptimisticZap]);

    const handleZapIntent = async (input: ZapIntentInput): Promise<void> => {
        if (!isWalletReadyForPayments(walletSettings.activeConnection)) {
            setPendingZapIntent({
                ...input,
                originPath: `${location.pathname}${location.search}`,
                phase: 'navigating',
            });
            navigate('/wallet');
            return;
        }

        await executeZapIntent(input);
    };

    const connectWebLnWallet = async (options: { silent?: boolean } = {}): Promise<boolean> => {
        const provider = detectWebLnProvider();
        if (!provider) {
            if (!options.silent) {
                toast.error('WebLN no está disponible en este navegador.', { duration: 2200 });
            }
            return false;
        }

        try {
            await provider.enable?.();
        } catch {
            if (!options.silent) {
                toast.error('No se pudo reconectar la wallet WebLN.', { duration: 2200 });
            }
            return false;
        }

        const capabilities = resolveWebLnCapabilities(provider);
        if (!capabilities.payInvoice) {
            if (!options.silent) {
                toast.error('El provider WebLN no soporta pagos.', { duration: 2200 });
            }
            return false;
        }

        const nextConnection = {
            method: 'webln',
            capabilities,
            restoreState: 'connected',
        } as const;
        persistWalletSettings({ activeConnection: nextConnection });
        setWalletNwcUriInput('');
        if (!options.silent) {
            toast.success('Wallet conectada', { duration: 1800 });
        }
        if (pendingZapIntent?.phase === 'paused' && location.pathname === '/wallet') {
            setPendingZapIntent({ ...pendingZapIntent, phase: 'ready' });
        }
        return true;
    };

    const connectNwcWallet = async (): Promise<void> => {
        try {
            const parsed = parseNwcConnectionUri(walletNwcUriInput);
            const info = await fetchNwcInfo(parsed);

            const nextConnection = {
                method: 'nwc',
                uri: parsed.uri,
                walletServicePubkey: parsed.walletServicePubkey,
                relays: parsed.relays,
                secret: parsed.secret,
                encryption: info.encryption,
                capabilities: info.capabilities,
                restoreState: 'connected',
            } as const;
            persistWalletSettings({ activeConnection: nextConnection });
            setWalletNwcUriInput('');
            toast.success('Wallet conectada', { duration: 1800 });
            if (pendingZapIntent?.phase === 'paused' && location.pathname === '/wallet') {
                setPendingZapIntent({ ...pendingZapIntent, phase: 'ready' });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo conectar la wallet NWC.';
            toast.error(message, { duration: 2200 });
        }
    };

    const disconnectWallet = (): void => {
        persistWalletSettings({ activeConnection: null });
        setWalletNwcUriInput('');
    };

    const refreshWallet = async (): Promise<void> => {
        if (!walletSettings.activeConnection) {
            return;
        }

        if (walletSettings.activeConnection.method === 'webln') {
            const revalidated = await connectWebLnWallet({ silent: true });
            if (!revalidated) {
                const provider = detectWebLnProvider();
                persistWalletSettings({
                    activeConnection: {
                        ...walletSettings.activeConnection,
                        capabilities: resolveWebLnCapabilities(provider),
                        restoreState: 'reconnect-required',
                    },
                });
            }
            return;
        }

        const info = await fetchNwcInfo(walletSettings.activeConnection);
        persistWalletSettings({
            activeConnection: {
                ...walletSettings.activeConnection,
                capabilities: info.capabilities,
                encryption: info.encryption,
            },
        });
    };

    const handleLogout = async (): Promise<void> => {
        await overlay.logoutSession?.();
        resetEasterEggProgress();
        setZapSettings(loadZapSettings());
        navigate('/');
    };

    useEffect(() => {
        if (!pendingZapIntent || location.pathname !== '/wallet' || pendingZapIntent.phase !== 'navigating') {
            return;
        }

        setPendingZapIntent((current) => current ? { ...current, phase: 'ready' } : current);
    }, [pendingZapIntent, location.pathname]);

    useEffect(() => {
        if (!pendingZapIntent || pendingZapIntent.phase !== 'ready' || !isWalletReadyForPayments(walletSettings.activeConnection) || location.pathname !== '/wallet' || resumingZap) {
            return;
        }

        setResumingZap(true);
        void executeZapIntent(pendingZapIntent)
            .then((result) => {
                if (result === 'success' || result === 'definitive_failure') {
                    setPendingZapIntent(null);
                } else {
                    setPendingZapIntent((current) => current ? { ...current, phase: 'paused' } : current);
                }

                if (result === 'success') {
                    navigate(pendingZapIntent.originPath || '/', { replace: true });
                }
            })
            .finally(() => {
                setResumingZap(false);
            });
    }, [pendingZapIntent, walletSettings.activeConnection, location.pathname, resumingZap, executeZapIntent, navigate]);

    useEffect(() => {
        if (!pendingZapIntent || pendingZapIntent.phase !== 'ready' || location.pathname === '/wallet') {
            return;
        }

        setPendingZapIntent(null);
    }, [pendingZapIntent, location.pathname]);

    return (
        <OverlayAppShell
            sidebar={!showLoginGate ? (
                <OverlaySidebar
                    open={sidebarOpen}
                    onOpenChange={setSidebarOpen}
                    {...(overlay.authSession ? { authSession: overlay.authSession } : {})}
                    {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                    {...(overlay.ownerProfile ? { ownerProfile: overlay.ownerProfile } : {})}
                    canWrite={overlay.canWrite}
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
                    onOpenWallet={() => navigate('/wallet')}
                    onOpenPublish={openPublishComposer}
                    onOpenSettings={openSettingsDestination}
                    isUiSettingsOpen={isUiSettingsDialogOpen}
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
                        {...(overlay.canWrite ? { onZapPerson: (pubkey: string, amount: number) => handleZapIntent({ targetPubkey: pubkey, amount }) } : {})}
                        onConfigureZapAmounts={() => openSettingsPage('zaps')}
                        onCopyOwnerNpub={copyOwnerIdentifier}
                        verificationByPubkey={verificationByPubkey}
                    />
                </OverlaySidebar>
            ) : null}
            mapControls={(
                <>

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

                            {overlay.canWrite && profileHasZapEndpoint(
                                overlay.profiles[buildingContextMenu.pubkey]
                                ?? overlay.followerProfiles[buildingContextMenu.pubkey]
                                ?? (overlay.ownerPubkey === buildingContextMenu.pubkey ? overlay.ownerProfile : undefined)
                            ) ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger data-testid="context-zap-submenu">Zap</ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-44">
                                        {zapSettings.amounts.map((amount) => (
                                            <ContextMenuItem
                                                data-testid={`context-zap-${amount}`}
                                                key={`zap-${amount}`}
                                                onSelect={() => {
                                                    closeOccupiedContextMenu();
                                                    void handleZapIntent({ targetPubkey: buildingContextMenu.pubkey, amount });
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
                            ) : null}
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

            <Toaster richColors position="bottom-center" closeButton={false} theme={resolvedOverlayTheme} />

            <UiSettingsDialog
                open={isUiSettingsDialogOpen}
                uiSettings={uiSettings}
                onPersistUiSettings={persistUiSettings}
                onOpenChange={(open) => {
                    if (open) {
                        openUiSettingsDialog();
                        return;
                    }

                    closeUiSettingsDialog();
                }}
            />
                </>
            )}
            main={(
            <Routes>
                {showLoginGate ? (
                    <>
                        <Route path="/login" element={null} />
                        <Route
                            path="*"
                            element={sessionRestorationResolved ? <Navigate to="/login" replace /> : null}
                        />
                    </>
                ) : (
                    <>
                <Route
                    path="/agora"
                    element={(
                        <FollowingFeedSurface
                            agoraFeedLayout={uiSettings.agoraFeedLayout}
                            onAgoraFeedLayoutChange={setAgoraFeedLayout}
                            items={followingFeed.items}
                            pendingNewCount={followingFeed.pendingNewCount}
                            hasPendingNewItems={followingFeed.hasPendingNewItems}
                            hasFollows={followingFeed.hasFollows}
                            profilesByPubkey={richContentProfilesByPubkey}
                            engagementByEventId={followingFeedEngagementByEventId}
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
                            isRefreshingFeed={followingFeed.isRefreshingFeed}
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
                            onApplyPendingNewItems={followingFeed.applyPendingNewItems}
                            onRefreshFeed={followingFeed.refreshFeed}
                            onOpenThread={followingFeed.openThread}
                            onCloseThread={followingFeed.closeThread}
                            onLoadMoreThread={followingFeed.loadNextThreadPage}
                            onPublishPost={followingFeed.publishPost}
                            onPublishReply={followingFeed.publishReply}
                            onSearchUsers={overlay.searchUsers}
                            ownerPubkey={overlay.ownerPubkey}
                            searchRelaySetKey={userSearchRelaySetKey}
                            onToggleReaction={followingFeed.toggleReaction}
                            onToggleRepost={handleToggleRepost}
                            onOpenQuoteComposer={openQuoteComposer}
                            onZap={({ eventId, eventKind, targetPubkey, amount }) => handleZapIntent({
                                targetPubkey: targetPubkey || '',
                                amount,
                                eventId,
                                ...(typeof eventKind === 'number' ? { eventKind } : {}),
                            })}
                            zapAmounts={zapSettings.amounts}
                            onConfigureZapAmounts={() => openSettingsPage('zaps')}
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
                            newNotifications={socialState.pendingSnapshot}
                            recentNotifications={socialState.items}
                            profilesByPubkey={overlay.profiles}
                            eventReferencesById={eventReferencesById}
                            onResolveProfiles={resolveMentionProfiles}
                            onResolveEventReferences={resolveEventReferences}
                            onOpenThread={openNotificationThread}
                            onOpenProfile={(pubkey) => overlay.openActiveProfile(pubkey)}
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
                    path="/wallet"
                    element={(
                        <WalletPage
                            walletState={walletSettings}
                            walletActivity={walletActivity}
                            nwcUriInput={walletNwcUriInput}
                            onNwcUriInputChange={setWalletNwcUriInput}
                            onConnectNwc={() => {
                                void connectNwcWallet();
                            }}
                            onConnectWebLn={() => {
                                void connectWebLnWallet();
                            }}
                            onDisconnect={disconnectWallet}
                            onRefresh={() => {
                                void refreshWallet();
                            }}
                        />
                    )}
                />
                <Route
                    path="/buscar-usuarios"
                    element={(
                        <UserSearchPage
                            onClose={closeGlobalUserSearch}
                            onSearch={overlay.searchUsers}
                            searchRelaySetKey={userSearchRelaySetKey}
                            onSelectUser={(pubkey) => {
                                overlay.openActiveProfile(pubkey);
                            }}
                            {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                            followedPubkeys={overlay.follows}
                            verificationByPubkey={verificationByPubkey}
                            {...(overlay.canWrite ? { onFollowUser: followPerson } : {})}
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
                            onUiSettingsChange={persistUiSettings}
                            {...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {})}
                            zapSettings={zapSettings}
                            onZapSettingsChange={setZapSettings}
                            onClose={() => navigate('/')}
                        />
                    )}
                    >
                        <Route index element={<Navigate to="zaps" replace />} />
                        <Route path="shortcuts" element={<SettingsShortcutsRoute />} />
                        <Route path="zaps" element={<SettingsZapsRoute />} />
                        <Route path="about" element={<SettingsAboutRoute />} />
                        <Route path="advanced" element={<SettingsAdvancedRoute />} />
                        <Route path="*" element={<Navigate to="zaps" replace />} />
                    </Route>
                    <Route path="/settings/relays" element={<Navigate to="/relays" replace />} />
                    <Route path="/settings/relays/detail" element={<Navigate to={`/relays/detail${location.search}`} replace />} />
                    <Route path="/settings/:view" element={<Navigate to="/settings/zaps" replace />} />
                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="/" element={null} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                )}
            </Routes>
            )}
            dialogs={(
                <>
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
                    engagementByEventId={activeProfileEngagementWithOptimisticByEventId}
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
                    verificationByPubkey={verificationByPubkey}
                    onLoadMorePosts={activeProfileData.loadMorePosts}
                    onRetryNetwork={activeProfileData.retryNetwork}
                    onSelectHashtag={selectProfilePostHashtag}
                    onSelectProfile={openMentionedProfile}
                    onCopyNpub={copyOwnerIdentifier}
                    ownerFollows={overlay.follows}
                    relaySuggestionsByType={activeProfileData.relaySuggestionsByType}
                    onAddRelaySuggestion={addRelaySuggestionToSettings}
                    onAddAllRelaySuggestions={addAllRelaySuggestionsToSettings}
                    {...(overlay.canWrite ? { onFollowProfile: followPerson } : {})}
                    {...(canAccessDirectMessages ? { onSendMessage: openDmFromContextMenu } : {})}
                    canWrite={overlay.canWrite}
                    reactionByEventId={followingFeed.reactionByEventId}
                    repostByEventId={followingFeed.repostByEventId}
                    pendingReactionByEventId={followingFeed.pendingReactionByEventId}
                    pendingRepostByEventId={followingFeed.pendingRepostByEventId}
                    onOpenThread={openThreadFromProfileDialog}
                    onToggleReaction={followingFeed.toggleReaction}
                    onToggleRepost={handleToggleRepost}
                    onOpenQuoteComposer={openQuoteComposer}
                    onZap={({ eventId, eventKind, targetPubkey, amount }) => handleZapIntent({
                        targetPubkey: targetPubkey || '',
                        amount,
                        eventId,
                        ...(typeof eventKind === 'number' ? { eventKind } : {}),
                    })}
                    zapAmounts={zapSettings.amounts}
                    onConfigureZapAmounts={() => openSettingsPage('zaps')}
                    onResolveProfiles={resolveMentionProfiles}
                    onResolveEventReferences={resolveEventReferences}
                    eventReferencesById={eventReferencesById}
                    onClose={overlay.closeActiveProfileDialog}
                    onRetryPosts={activeProfileData.retryPosts}
                />
            ) : null}

            {activeEasterEgg ? (
                <EasterEggDialog
                    key={activeEasterEgg.nonce}
                    buildingIndex={activeEasterEgg.buildingIndex}
                    entry={getEasterEggEntry(activeEasterEgg.easterEggId)}
                    onClose={closeActiveEasterEgg}
                />
            ) : null}

            <EasterEggFireworks nonce={easterEggCelebrationNonce} />

            {socialComposeState ? (
                <SocialComposeDialog
                    open
                    mode={socialComposeState.mode}
                    {...(socialComposeState.quoteTarget ? { quoteTarget: socialComposeState.quoteTarget } : {})}
                    profilesByPubkey={richContentProfilesByPubkey}
                    isSubmitting={isSubmittingSocialCompose}
                    onSearchUsers={overlay.searchUsers}
                    ownerPubkey={overlay.ownerPubkey}
                    searchRelaySetKey={userSearchRelaySetKey}
                    onOpenChange={(open) => {
                        if (!open) {
                            closeSocialCompose();
                        }
                    }}
                    onSubmit={submitSocialCompose}
                />
            ) : null}

            {showLoginGate ? (
                <LoginGateScreen
                    authSession={overlay.authSession}
                    savedLocalAccount={overlay.savedLocalAccount}
                    disabled={loginDisabled || !sessionRestorationResolved}
                    mapLoaderText={mapLoaderText}
                    overlayTheme={resolvedOverlayTheme}
                    restoringSession={!sessionRestorationResolved}
                    onStartSession={overlay.startSession}
                />
            ) : null}
                </>
            )}
        />
    );
}
