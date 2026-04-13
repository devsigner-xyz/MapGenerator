import { Outlet, useLocation } from 'react-router';
import { settingsViewFromPathname } from '../../settings/settings-routing';
import type { SettingsRouteContextValue } from './settings-route-context';

interface OverlaySettingsLayoutProps extends SettingsRouteContextValue {
}

export function OverlaySettingsLayout(contextValue: OverlaySettingsLayoutProps) {
    const location = useLocation();
    const view = settingsViewFromPathname(location.pathname);
    const relaysViewActive = view === 'relays';

    return (
        <section className="nostr-routed-surface" aria-label="Ajustes">
            <div className="nostr-routed-surface-content">
                <div className={`nostr-settings-page nostr-routed-surface-panel nostr-page-layout${relaysViewActive ? ' nostr-settings-page-relays' : ''}`}>
                    <h2 className="sr-only">Ajustes</h2>
                    <p className="sr-only">Configuracion del overlay del mapa.</p>
                    <Outlet context={contextValue} />
                </div>
            </div>
        </section>
    );
}
