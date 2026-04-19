import { OverlayPageHeader } from '../OverlayPageHeader';

export function SettingsShortcutsPage() {
    return (
        <>
            <OverlayPageHeader
                title="Atajos"
                description="Atajos de teclado y navegacion rapida para el mapa."
            />
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-shortcuts-content">
                    <p>Mantener pulsada la barra espaciadora y arrastrar para desplazarte por el mapa.</p>
                    <p>Mantener pulsado el wheel del raton y mover el raton para desplazarte por el mapa.</p>
                </div>
            </div>
        </>
    );
}
