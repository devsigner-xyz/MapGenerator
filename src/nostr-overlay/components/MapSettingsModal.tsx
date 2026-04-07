import { useEffect, useRef, useState } from 'react';
import type { MapBridge } from '../map-bridge';

interface MapSettingsModalProps {
    mapBridge: MapBridge | null;
    onClose: () => void;
}

type SettingsView = 'settings' | 'shortcuts';

export function MapSettingsModal({ mapBridge, onClose }: MapSettingsModalProps) {
    const [view, setView] = useState<SettingsView>('settings');
    const settingsHostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!mapBridge || view !== 'settings' || !settingsHostRef.current) {
            return;
        }

        mapBridge.mountSettingsPanel(settingsHostRef.current);
        return () => {
            mapBridge.mountSettingsPanel(null);
        };
    }, [mapBridge, view]);

    return (
        <div className="nostr-modal-backdrop" role="presentation" onClick={onClose}>
            <div className="nostr-modal nostr-settings-modal" role="dialog" aria-modal="true" aria-label="Ajustes" onClick={(event) => event.stopPropagation()}>
                <div className="nostr-settings-header">
                    {view === 'shortcuts' ? (
                        <button type="button" className="nostr-settings-back" onClick={() => setView('settings')}>
                            Volver
                        </button>
                    ) : (
                        <span className="nostr-settings-spacer" aria-hidden="true" />
                    )}

                    <p className="nostr-settings-title">{view === 'settings' ? 'Settings' : 'Shortcuts'}</p>

                    <button type="button" className="nostr-modal-close" onClick={onClose} aria-label="Cerrar ajustes">
                        x
                    </button>
                </div>

                {view === 'settings' ? (
                    <div className="nostr-settings-content">
                        <button type="button" className="nostr-settings-item" onClick={() => setView('shortcuts')}>
                            Shortcuts
                        </button>

                        <div ref={settingsHostRef} className="nostr-settings-host" />
                    </div>
                ) : (
                    <div className="nostr-shortcuts-content">
                        <p>Mantener pulsada la barra espaciadora y arrastrar para desplazarte por el mapa.</p>
                        <p>Mantener pulsado el wheel del raton y mover el raton para desplazarte por el mapa.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
