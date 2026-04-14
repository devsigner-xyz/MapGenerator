export function SettingsShortcutsPage() {
    return (
        <>
            <header className="nostr-page-header">
                <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">Shortcuts</h4>
                <p className="text-sm text-muted-foreground">Atajos de teclado y navegacion rapida para el mapa.</p>
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
