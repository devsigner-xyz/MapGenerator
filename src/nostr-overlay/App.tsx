import { useEffect, useState } from 'react';
import { loadUiSettings, type UiSettingsState } from '../nostr/ui-settings';
import { MapPresenceLayer } from './components/MapPresenceLayer';
import { NpubForm } from './components/NpubForm';
import { MapSettingsModal } from './components/MapSettingsModal';
import { OccupantProfileModal } from './components/OccupantProfileModal';
import { SocialSidebar } from './components/SocialSidebar';
import { MapZoomControls } from './components/MapZoomControls';
import { useNostrOverlay, type MapLoaderStage, type NostrOverlayServices } from './hooks/useNostrOverlay';
import type { MapBridge } from './map-bridge';

interface AppProps {
    mapBridge: MapBridge | null;
    services?: NostrOverlayServices;
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
    const [panelCollapsed, setPanelCollapsed] = useState(false);
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const formDisabled = overlay.status !== 'idle' && overlay.status !== 'success' && overlay.status !== 'error';
    const mapLoaderText = mapLoaderStageLabel(overlay.mapLoaderStage);
    const regenerateDisabled = !mapBridge || overlay.mapLoaderStage !== null;

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
        if (!toastMessage) {
            return;
        }

        const timer = window.setTimeout(() => {
            setToastMessage(null);
        }, 1600);

        return () => window.clearTimeout(timer);
    }, [toastMessage]);

    const copyOwnerIdentifier = async (value: string): Promise<void> => {
        if (!value) {
            return;
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            setToastMessage('npub copiada');
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
            setToastMessage('npub copiada');
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

    return (
        <div className={`nostr-overlay-shell${panelCollapsed ? ' nostr-overlay-shell-collapsed' : ''}`}>
            {panelCollapsed ? (
                <div className="nostr-compact-toolbar">
                    <button
                        type="button"
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
                    </button>

                    <button
                        type="button"
                        className="nostr-settings-button"
                        aria-label="Abrir ajustes"
                        title="Settings"
                        onClick={() => setSettingsOpen(true)}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.56 7.56 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.23-1.11.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64L4.86 11c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.61.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        className="nostr-settings-button"
                        aria-label="Mostrar panel"
                        title="Show panel"
                        onClick={() => setPanelCollapsed(false)}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13zm3 0v13h11v-13H7zm2.2 6.7h5.6l-2.3 2.3a1 1 0 1 0 1.4 1.4l4-4a1 1 0 0 0 0-1.4l-4-4a1 1 0 0 0-1.4 1.4l2.3 2.3H9.2a1 1 0 1 0 0 2z" />
                        </svg>
                    </button>
                </div>
            ) : (
                <section className="nostr-panel">
                    <div className="nostr-panel-toolbar">
                        <button
                            type="button"
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
                        </button>

                        <button
                            type="button"
                            className="nostr-settings-button"
                            aria-label="Abrir ajustes"
                            title="Settings"
                            onClick={() => setSettingsOpen(true)}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.56 7.56 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.23-1.11.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64L4.86 11c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.61.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
                            </svg>
                        </button>

                        <button
                            type="button"
                            className="nostr-settings-button"
                            aria-label="Ocultar panel"
                            title="Hide panel"
                            onClick={() => setPanelCollapsed(true)}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13zm3 0v13h11v-13H7zm7.6 6.7H9l2.3 2.3a1 1 0 0 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 1 1 1.4 1.4L9 10.2h5.6a1 1 0 1 1 0 2z" />
                            </svg>
                        </button>
                    </div>

                    <NpubForm disabled={formDisabled} onSubmit={overlay.submitNpub} />

                    {overlay.status === 'error' && overlay.error ? (
                        <p className="nostr-error">{overlay.error}</p>
                    ) : null}

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
                        onLocateOwner={locateOwnerOnMap}
                        onCopyOwnerNpub={copyOwnerIdentifier}
                    />
                </section>
            )}

            <MapZoomControls mapBridge={mapBridge} />

            {mapLoaderText ? (
                <div className="nostr-map-loader-overlay" role="status" aria-live="polite">
                    <div className="nostr-map-loader-card">
                        <span className="nostr-map-loader-spinner" aria-hidden="true" />
                        <p className="nostr-map-loader-text">{mapLoaderText}</p>
                    </div>
                </div>
            ) : null}

            {toastMessage ? (
                <div className="nostr-toast" role="status" aria-live="polite">
                    {toastMessage}
                </div>
            ) : null}

            {settingsOpen ? (
                <MapSettingsModal
                    mapBridge={mapBridge}
                    suggestedRelays={overlay.suggestedRelays}
                    onUiSettingsChange={setUiSettings}
                    onClose={() => setSettingsOpen(false)}
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
                    onLoadMorePosts={overlay.loadMoreActiveProfilePosts}
                    onClose={overlay.closeActiveProfileModal}
                />
            ) : null}
        </div>
    );
}
