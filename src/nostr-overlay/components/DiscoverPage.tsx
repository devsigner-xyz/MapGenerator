import type { EasterEggId } from '../../ts/ui/easter_eggs';
import { EASTER_EGG_MISSIONS } from '../easter-eggs/missions';

interface DiscoverPageProps {
    discoveredIds: EasterEggId[];
}

export function DiscoverPage({ discoveredIds }: DiscoverPageProps) {
    const discoveredSet = new Set(discoveredIds);
    const discoveredCount = EASTER_EGG_MISSIONS.reduce(
        (count, mission) => count + (discoveredSet.has(mission.id) ? 1 : 0),
        0
    );

    return (
        <section className="nostr-routed-surface" aria-label="Descubre easter eggs">
            <div className="nostr-routed-surface-content">
                <div className="nostr-easter-egg-missions-page nostr-routed-surface-panel nostr-page-layout">
                    <header className="nostr-page-header">
                        <h3 className="nostr-page-header-inline-title">Descubre</h3>
                        <p>
                            Has descubierto {discoveredCount} de {EASTER_EGG_MISSIONS.length} easter eggs.
                        </p>
                    </header>
                    <section className="nostr-page-content">
                        <ul className="nostr-easter-egg-missions-list">
                            {EASTER_EGG_MISSIONS.map((mission) => {
                                const discovered = discoveredSet.has(mission.id);
                                return (
                                    <li key={mission.id} className="nostr-easter-egg-missions-item">
                                        <span className="nostr-easter-egg-missions-label">{mission.label}</span>
                                        <span className={`nostr-easter-egg-missions-status${discovered ? ' is-discovered' : ''}`}>
                                            {discovered ? 'Encontrado' : 'Pendiente'}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </div>
            </div>
        </section>
    );
}
