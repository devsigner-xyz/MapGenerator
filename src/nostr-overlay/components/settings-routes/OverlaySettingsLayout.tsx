import { Outlet } from 'react-router';
import type { SettingsRouteContextValue } from './settings-route-context';

type OverlaySettingsLayoutProps = SettingsRouteContextValue;

export function OverlaySettingsLayout(contextValue: OverlaySettingsLayoutProps) {
    return (
        <section className="nostr-routed-surface" aria-label="Ajustes">
            <div className="nostr-routed-surface-content">
                <div className="nostr-settings-page nostr-routed-surface-panel nostr-page-layout">
                    <h2 className="sr-only">Ajustes</h2>
                    <p className="sr-only">Configuracion del overlay del mapa.</p>
                    <Outlet context={contextValue} />
                </div>
            </div>
        </section>
    );
}
