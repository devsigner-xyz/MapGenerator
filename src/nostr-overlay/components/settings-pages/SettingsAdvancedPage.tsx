import type { RefObject } from 'react';

interface SettingsAdvancedPageProps {
    settingsHostRef: RefObject<HTMLDivElement | null>;
}

export function SettingsAdvancedPage({ settingsHostRef }: SettingsAdvancedPageProps) {
    return (
        <>
            <header className="nostr-page-header">
                <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">Advanced settings</h4>
                <p className="text-sm text-muted-foreground">Configuracion avanzada del mapa y parametros de simulacion.</p>
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
