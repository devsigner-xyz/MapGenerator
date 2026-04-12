export function SettingsShortcutsPage() {
    return (
        <>
            <header className="nostr-page-header">
                <h3 className="nostr-page-header-inline-title">Shortcuts</h3>
                <p>Atajos de teclado y navegacion rapida para el mapa.</p>
            </header>
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-shortcuts-content">
                    <p>Mantener pulsada la barra espaciadora y arrastrar para desplazarte por el mapa.</p>
                    <p>Mantener pulsado el wheel del raton y mover el raton para desplazarte por el mapa.</p>
                </div>
            </div>
        </>
    );
}
