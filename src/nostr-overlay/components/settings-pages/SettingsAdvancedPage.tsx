import type { RefObject } from 'react';
import { OverlayPageHeader } from '../OverlayPageHeader';

interface SettingsAdvancedPageProps {
    settingsHostRef: RefObject<HTMLDivElement | null>;
}

export function SettingsAdvancedPage({ settingsHostRef }: SettingsAdvancedPageProps) {
    return (
        <>
            <OverlayPageHeader
                title="Ajustes avanzados"
                description="Configuracion avanzada del mapa y parametros de simulacion."
            />
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-shortcuts-content">
                    <p>Configuracion avanzada del MapGenerator.</p>
                    <div ref={settingsHostRef} className="nostr-settings-host" />
                </div>
            </div>
        </>
    );
}
