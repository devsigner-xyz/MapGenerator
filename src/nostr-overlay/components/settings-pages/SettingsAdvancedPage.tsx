import type { RefObject } from 'react';

interface SettingsAdvancedPageProps {
    settingsHostRef: RefObject<HTMLDivElement | null>;
}

export function SettingsAdvancedPage({ settingsHostRef }: SettingsAdvancedPageProps) {
    return (
        <>
            <header className="nostr-page-header">
                <h3 className="nostr-page-header-inline-title">Advanced settings</h3>
                <p>Configuracion avanzada del mapa y parametros de simulacion.</p>
            </header>
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-shortcuts-content">
                    <p>Configuracion avanzada del MapGenerator.</p>
                    <div ref={settingsHostRef} className="nostr-settings-host" />
                </div>
            </div>
        </>
    );
}
