import { OverlayPageHeader } from '../OverlayPageHeader';

export function SettingsShortcutsPage() {
    return (
        <>
            <OverlayPageHeader
                title="Atajos"
                description="Atajos de teclado y navegacion rapida para el mapa."
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-shortcuts-content">
                    <p>Mantener pulsada la barra espaciadora y arrastrar para desplazarte por el mapa.</p>
                    <p>Mantener pulsado el wheel del raton y mover el raton para desplazarte por el mapa.</p>
                </div>
            </div>
        </>
    );
}
