import { FollowingList } from './components/FollowingList';
import { NpubForm } from './components/NpubForm';
import { StatusPanel } from './components/StatusPanel';
import { useNostrOverlay, type NostrOverlayServices } from './hooks/useNostrOverlay';
import type { MapBridge } from './map-bridge';

interface AppProps {
    mapBridge: MapBridge | null;
    services?: NostrOverlayServices;
}

export function App({ mapBridge, services }: AppProps) {
    const overlay = useNostrOverlay({ mapBridge, services });

    return (
        <div className="nostr-overlay-shell">
            <section className="nostr-panel">
                <header className="nostr-header">
                    <p className="nostr-kicker">Nostr Layer</p>
                    <h2 className="nostr-title">Poblar ciudad con seguidos</h2>
                </header>

                <NpubForm disabled={overlay.status === 'loading'} onSubmit={overlay.submitNpub} />

                <StatusPanel
                    status={overlay.status}
                    error={overlay.error}
                    followsCount={overlay.followsCount}
                    assignedCount={overlay.assignedCount}
                />

                <FollowingList
                    follows={overlay.follows}
                    profiles={overlay.profiles}
                    selectedPubkey={overlay.selectedPubkey}
                    onSelect={overlay.selectFollowing}
                />
            </section>
        </div>
    );
}
