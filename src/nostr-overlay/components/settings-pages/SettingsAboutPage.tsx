import { OverlayPageHeader } from '../OverlayPageHeader';

export function SettingsAboutPage() {
    return (
        <>
            <OverlayPageHeader
                title="Acerca de"
                description="Informacion general de protocolo y funcionalidades disponibles."
            />
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-shortcuts-content">
                    <div className="nostr-about-section">
                        <h4>NIPs soportadas</h4>
                        <ul>
                            <li>NIP-19 (npub)</li>
                            <li>NIP-65 (relay list metadata)</li>
                            <li>NIP-17 (DM inbox relays)</li>
                            <li>Kind 0 (metadata de perfil)</li>
                            <li>Kind 1 (publicaciones)</li>
                            <li>Kind 3 (follows/followers)</li>
                        </ul>
                    </div>

                    <div className="nostr-about-section">
                        <h4>Caracteristicas</h4>
                        <ul>
                            <li>Overlay social sobre el mapa</li>
                            <li>Foco de ocupantes y perfil detallado</li>
                            <li>Carga progresiva de red y publicaciones</li>
                            <li>Configuracion de relays desde ajustes</li>
                            <li>Estadisticas de ciudad en tiempo real</li>
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
}
