import { useEffect, useMemo, useRef, useState } from 'react';
import { loadUiSettings, type UiSettingsState } from '../nostr/ui-settings';
import { loadZapSettings, type ZapSettingsState } from '../nostr/zap-settings';
import { encodeHexToNpub } from '../nostr/npub';
import { MapPresenceLayer } from './components/MapPresenceLayer';
import { MapSettingsModal, type SettingsView } from './components/MapSettingsModal';
import { OccupantProfileModal } from './components/OccupantProfileModal';
import { EasterEggModal } from './components/EasterEggModal';
import { SocialSidebar } from './components/SocialSidebar';
import { MapZoomControls } from './components/MapZoomControls';
import { CityStatsModal } from './components/CityStatsModal';
import { useNostrOverlay, type MapLoaderStage, type NostrOverlayServices } from './hooks/useNostrOverlay';
import { useNip05Verification } from './hooks/useNip05Verification';
import type { EasterEggBuildingClickPayload, MapBridge, OccupiedBuildingContextPayload } from './map-bridge';
import { extractStreetLabelUsernames } from './domain/street-label-users';
import { getEasterEggEntry } from './easter-eggs/catalog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface EasterEggModalState extends EasterEggBuildingClickPayload {
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
    const overlay = useNostrOverlay({ mapBridge, services });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsInitialView, setSettingsInitialView] = useState<SettingsView>('settings');
    const [cityStatsOpen, setCityStatsOpen] = useState(false);
    const [panelCollapsed, setPanelCollapsed] = useState(false);
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettings, setZapSettings] = useState<ZapSettingsState>(() => loadZapSettings());
    const [buildingContextMenu, setBuildingContextMenu] = useState<OccupiedBuildingContextMenuState | null>(null);
    const [activeEasterEgg, setActiveEasterEgg] = useState<EasterEggModalState | null>(null);
    const contextMenuTriggerRef = useRef<HTMLSpanElement | null>(null);
    const contextMenuNonceRef = useRef(0);
    const easterEggNonceRef = useRef(0);
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

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        mapBridge.setViewportInsetLeft(panelCollapsed ? 0 : 380);
        return () => {
            mapBridge.setViewportInsetLeft(0);
        };
    }, [mapBridge, panelCollapsed]);

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
            easterEggNonceRef.current += 1;
            setActiveEasterEgg({
                ...payload,
                nonce: easterEggNonceRef.current,
            });
        });
    }, [mapBridge]);

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

    const openSettingsModal = (view: SettingsView = 'settings'): void => {
        setSettingsInitialView(view);
        setSettingsOpen(true);
    };

    const writeDmToPubkey = async (pubkey: string): Promise<void> => {
        const npub = encodePubkeyAsNpub(pubkey);
        const dmUrl = `nostr:${npub}`;
        const opened = typeof window.open === 'function' ? window.open(dmUrl, '_blank', 'noopener,noreferrer') : null;
        if (opened) {
            toast.success('Abriendo DM...', { duration: 1600 });
            return;
        }

        await copyOwnerIdentifier(npub);
        toast.message('No se pudo abrir el cliente DM; npub copiada', { duration: 2200 });
    };

    return (
        <div className={`nostr-overlay-shell${panelCollapsed ? ' nostr-overlay-shell-collapsed' : ''}`}>
            {panelCollapsed ? (
                <div className="nostr-compact-toolbar">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="nostr-settings-button"
                        aria-label="Mostrar panel"
                        title="Show panel"
                        onClick={() => setPanelCollapsed(false)}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13zm3 0v13h11v-13H7zm2.2 6.7h5.6l-2.3 2.3a1 1 0 1 0 1.4 1.4l4-4a1 1 0 0 0 0-1.4l-4-4a1 1 0 0 0-1.4 1.4l2.3 2.3H9.2a1 1 0 1 0 0 2z" />
                        </svg>
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="nostr-settings-button"
                        aria-label="Abrir ajustes"
                        title="Settings"
                        onClick={() => openSettingsModal('settings')}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.56 7.56 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.23-1.11.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64L4.86 11c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.61.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
                        </svg>
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="nostr-settings-button"
                        aria-label="Regenerar mapa"
                        title="New map"
                        onClick={() => {
                            void overlay.regenerateMap();
                        }}
                        disabled={regenerateDisabled}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M20 4v6h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="nostr-settings-button"
                        aria-label="Abrir estadisticas de la ciudad"
                        title="City stats"
                        onClick={() => setCityStatsOpen(true)}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M8 20v-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M12 20v-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M16 20v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </Button>
                </div>
            ) : (
                <section className="nostr-panel">
                    <div className="nostr-panel-toolbar">
                        <div className="nostr-panel-toolbar-status">
                            {overlay.authSession?.readonly ? <Badge variant="outline">Read Only</Badge> : null}
                        </div>

                        <div className="nostr-panel-toolbar-actions">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="nostr-settings-button"
                                aria-label="Abrir estadisticas de la ciudad"
                                title="City stats"
                                onClick={() => setCityStatsOpen(true)}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M8 20v-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M12 20v-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M16 20v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="nostr-settings-button"
                                aria-label="Regenerar mapa"
                                title="New map"
                                onClick={() => {
                                    void overlay.regenerateMap();
                                }}
                                disabled={regenerateDisabled}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M20 4v6h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="nostr-settings-button"
                                aria-label="Abrir ajustes"
                                title="Settings"
                                onClick={() => openSettingsModal('settings')}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.56 7.56 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.23-1.11.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64L4.86 11c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.61.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
                                </svg>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="nostr-settings-button"
                                aria-label="Ocultar panel"
                                title="Hide panel"
                                onClick={() => setPanelCollapsed(true)}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13zm3 0v13h11v-13H7zm7.6 6.7H9l2.3 2.3a1 1 0 0 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 1 1 1.4 1.4L9 10.2h5.6a1 1 0 1 1 0 2z" />
                                </svg>
                            </Button>
                        </div>
                    </div>

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
                        onLocateOwner={locateOwnerOnMap}
                        onCopyOwnerNpub={copyOwnerIdentifier}
                        loginDisabled={loginDisabled}
                        authSession={overlay.authSession}
                        canWrite={overlay.canWrite}
                        canEncrypt={overlay.canEncrypt}
                        onStartSession={overlay.startSession}
                        verificationByPubkey={verificationByPubkey}
                    />
                </section>
            )}

            <MapZoomControls mapBridge={mapBridge} />

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
                            <ContextMenuItem
                                data-testid="context-copy-npub"
                                onSelect={() => {
                                    void copyOwnerIdentifier(encodePubkeyAsNpub(buildingContextMenu.pubkey));
                                    closeOccupiedContextMenu();
                                }}
                            >
                                Copiar npub
                            </ContextMenuItem>
                            <ContextMenuItem
                                data-testid="context-write-dm"
                                onSelect={() => {
                                    void writeDmToPubkey(buildingContextMenu.pubkey);
                                    closeOccupiedContextMenu();
                                }}
                            >
                                Enviar mensaje
                            </ContextMenuItem>
                            <ContextMenuItem
                                data-testid="context-view-details"
                                onSelect={() => {
                                    overlay.openActiveProfile(buildingContextMenu.pubkey, buildingContextMenu.buildingIndex);
                                    closeOccupiedContextMenu();
                                }}
                            >
                                Ver detalles
                            </ContextMenuItem>

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
                                            openSettingsModal('zaps');
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
                        <Spinner className="nostr-map-loader-spinner" />
                        <p className="nostr-map-loader-text">{mapLoaderText}</p>
                    </div>
                </div>
            ) : null}

            <Toaster richColors position="bottom-center" closeButton={false} />

            {settingsOpen ? (
                <MapSettingsModal
                    mapBridge={mapBridge}
                    suggestedRelays={overlay.suggestedRelays}
                    onUiSettingsChange={setUiSettings}
                    zapSettings={zapSettings}
                    onZapSettingsChange={setZapSettings}
                    initialView={settingsInitialView}
                    hasActiveSession={Boolean(overlay.authSession)}
                    onLogoutSession={overlay.logoutSession}
                    onClose={() => {
                        setSettingsOpen(false);
                        setSettingsInitialView('settings');
                    }}
                />
            ) : null}

            {cityStatsOpen ? (
                <CityStatsModal
                    buildingsCount={overlay.buildingsCount}
                    occupiedBuildingsCount={overlay.assignedCount}
                    assignedResidentsCount={overlay.assignedCount}
                    followsCount={overlay.followsCount}
                    followersCount={overlay.followersCount}
                    parkCount={overlay.parkCount}
                    unhousedResidentsCount={overlay.unassignedCount}
                    onClose={() => setCityStatsOpen(false)}
                />
            ) : null}

            <MapPresenceLayer
                mapBridge={mapBridge}
                occupancyByBuildingIndex={overlay.occupancyByBuildingIndex}
                profiles={overlay.profiles}
                ownerPubkey={overlay.ownerPubkey}
                ownerProfile={overlay.ownerProfile}
                ownerBuildingIndex={overlay.ownerBuildingIndex}
                occupiedLabelsZoomLevel={uiSettings.occupiedLabelsZoomLevel}
                alwaysVisiblePubkeys={overlay.alwaysVisiblePubkeys}
            />

            {overlay.activeProfilePubkey ? (
                <OccupantProfileModal
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
                    onClose={overlay.closeActiveProfileModal}
                />
            ) : null}

            {activeEasterEgg ? (
                <EasterEggModal
                    key={activeEasterEgg.nonce}
                    buildingIndex={activeEasterEgg.buildingIndex}
                    entry={getEasterEggEntry(activeEasterEgg.easterEggId)}
                    onClose={() => setActiveEasterEgg(null)}
                />
            ) : null}
        </div>
    );
}
