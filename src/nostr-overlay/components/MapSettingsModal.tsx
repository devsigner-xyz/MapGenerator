import { useEffect, useRef, useState } from 'react';
import { addRelay, loadRelaySettings, removeRelay, saveRelaySettings, type RelaySettingsState } from '../../nostr/relay-settings';
import { normalizeRelayUrl } from '../../nostr/relay-policy';
import { loadUiSettings, saveUiSettings, type UiSettingsState } from '../../nostr/ui-settings';
import type { MapBridge } from '../map-bridge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

interface MapSettingsModalProps {
    mapBridge: MapBridge | null;
    suggestedRelays?: string[];
    onUiSettingsChange?: (nextState: UiSettingsState) => void;
    onClose: () => void;
}

type SettingsView = 'settings' | 'ui' | 'shortcuts' | 'relays';

function normalizeRelayInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
        return normalizeRelayUrl(trimmed);
    }

    return normalizeRelayUrl(`wss://${trimmed}`);
}

export function MapSettingsModal({ mapBridge, suggestedRelays = [], onUiSettingsChange, onClose }: MapSettingsModalProps) {
    const [view, setView] = useState<SettingsView>('settings');
    const [relaySettings, setRelaySettings] = useState<RelaySettingsState>(() => loadRelaySettings());
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [newRelayInput, setNewRelayInput] = useState('');
    const [invalidRelayInputs, setInvalidRelayInputs] = useState<string[]>([]);
    const settingsHostRef = useRef<HTMLDivElement | null>(null);

    const persistRelaySettings = (nextState: RelaySettingsState): void => {
        const savedState = saveRelaySettings(nextState);
        setRelaySettings(savedState);
    };

    const persistUiSettings = (nextState: UiSettingsState): void => {
        const savedState = saveUiSettings(nextState);
        setUiSettings(savedState);
        onUiSettingsChange?.(savedState);
    };

    const handleAddRelays = (): void => {
        const lines = newRelayInput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            setInvalidRelayInputs([]);
            return;
        }

        let nextState = relaySettings;
        const invalid: string[] = [];

        for (const line of lines) {
            const normalized = normalizeRelayInput(line);
            if (!normalized) {
                invalid.push(line);
                continue;
            }

            nextState = addRelay(nextState, normalized);
        }

        persistRelaySettings(nextState);
        setInvalidRelayInputs(invalid);
        setNewRelayInput('');
    };

    const handleRemoveRelay = (relayUrl: string): void => {
        const nextState = removeRelay(relaySettings, relayUrl);
        persistRelaySettings(nextState);
    };

    const handleAddSuggestedRelay = (relayUrl: string): void => {
        const nextState = addRelay(relaySettings, relayUrl);
        persistRelaySettings(nextState);
    };

    const handleAddAllSuggestedRelays = (): void => {
        let nextState = relaySettings;
        for (const relayUrl of suggestedRelays) {
            nextState = addRelay(nextState, relayUrl);
        }
        persistRelaySettings(nextState);
    };

    const suggestedNotAdded = suggestedRelays.filter((relayUrl) => !relaySettings.relays.includes(relayUrl));

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
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent className="nostr-modal nostr-settings-modal" showCloseButton={false} aria-label="Ajustes">
                <DialogTitle className="sr-only">Ajustes</DialogTitle>
                <DialogDescription className="sr-only">Configuracion del overlay del mapa.</DialogDescription>
                <div className="nostr-settings-header">
                    {view === 'ui' || view === 'shortcuts' || view === 'relays' ? (
                        <Button type="button" variant="ghost" className="nostr-settings-back" onClick={() => setView('settings')}>
                            Volver
                        </Button>
                    ) : (
                        <span className="nostr-settings-spacer" aria-hidden="true" />
                    )}

                    <p className="nostr-settings-title">
                        {view === 'settings' ? 'Settings' : view === 'ui' ? 'UI' : view === 'shortcuts' ? 'Shortcuts' : 'Relays'}
                    </p>

                    <Button type="button" variant="ghost" className="nostr-modal-close" onClick={onClose} aria-label="Cerrar ajustes">
                        x
                    </Button>
                </div>

                {view === 'settings' ? (
                    <div className="nostr-settings-content">
                        <Button type="button" variant="outline" className="nostr-settings-item" onClick={() => setView('ui')}>
                            UI
                        </Button>

                        <Button type="button" variant="outline" className="nostr-settings-item" onClick={() => setView('shortcuts')}>
                            Shortcuts
                        </Button>

                        <Button type="button" variant="outline" className="nostr-settings-item" onClick={() => setView('relays')}>
                            Relays
                        </Button>

                        <div ref={settingsHostRef} className="nostr-settings-host" />
                    </div>
                ) : view === 'ui' ? (
                    <div className="nostr-shortcuts-content">
                        <p>Configura el zoom minimo para mostrar avatar y nombre en edificios ocupados.</p>
                        <div className="nostr-ui-slider-row">
                            <Label className="nostr-label" htmlFor="nostr-occupied-zoom-level">Occupied labels zoom level</Label>
                            <span className="nostr-ui-slider-value">{uiSettings.occupiedLabelsZoomLevel}</span>
                        </div>
                        <input
                            id="nostr-occupied-zoom-level"
                            className="nostr-input"
                            type="range"
                            aria-label="Occupied labels zoom level"
                            min={1}
                            max={20}
                            step={1}
                            value={uiSettings.occupiedLabelsZoomLevel}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }
                                persistUiSettings({
                                    ...uiSettings,
                                    occupiedLabelsZoomLevel: nextValue,
                                });
                            }}
                        />
                        <div className="nostr-ui-slider-marks" aria-hidden="true">
                            <span>1</span>
                            <span>8</span>
                            <span>20</span>
                        </div>

                        <Separator className="nostr-divider" />

                        <div className="nostr-ui-toggle-row">
                            <Label className="nostr-label" htmlFor="nostr-street-labels-enabled">Street labels</Label>
                            <input
                                id="nostr-street-labels-enabled"
                                type="checkbox"
                                aria-label="Street labels enabled"
                                checked={uiSettings.streetLabelsEnabled}
                                onChange={(event) => {
                                    persistUiSettings({
                                        ...uiSettings,
                                        streetLabelsEnabled: event.target.checked,
                                    });
                                }}
                            />
                        </div>

                        <div className="nostr-ui-slider-row">
                            <Label className="nostr-label" htmlFor="nostr-street-zoom-level">Street labels zoom level</Label>
                            <span className="nostr-ui-slider-value">{uiSettings.streetLabelsZoomLevel}</span>
                        </div>
                        <input
                            id="nostr-street-zoom-level"
                            className="nostr-input"
                            type="range"
                            aria-label="Street labels zoom level"
                            min={1}
                            max={20}
                            step={1}
                            disabled={!uiSettings.streetLabelsEnabled}
                            value={uiSettings.streetLabelsZoomLevel}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }
                                persistUiSettings({
                                    ...uiSettings,
                                    streetLabelsZoomLevel: nextValue,
                                });
                            }}
                        />
                    </div>
                ) : view === 'relays' ? (
                    <div className="nostr-relays-content">
                        <p className="nostr-relays-help">Conecta varios relays. Puedes agregar uno por linea.</p>

                        <ul className="nostr-relay-list">
                            {relaySettings.relays.map((relayUrl) => (
                                <li key={relayUrl} className="nostr-relay-item">
                                    <span className="nostr-relay-url">{relayUrl}</span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="nostr-relay-remove"
                                        aria-label={`Eliminar relay ${relayUrl}`}
                                        onClick={() => handleRemoveRelay(relayUrl)}
                                    >
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>

                        <Textarea
                            className="nostr-input nostr-relay-editor"
                            placeholder="wss://relay.example\nwss://nos.lol"
                            rows={4}
                            value={newRelayInput}
                            onChange={(event) => setNewRelayInput(event.target.value)}
                        />

                        <Button type="button" className="nostr-submit nostr-relay-add" onClick={handleAddRelays}>
                            Add relays
                        </Button>

                        {invalidRelayInputs.length > 0 ? (
                            <p className="nostr-settings-error">
                                Entradas invalidas: {invalidRelayInputs.join(', ')}
                            </p>
                        ) : null}

                        {suggestedRelays.length > 0 ? (
                            <section className="nostr-relay-suggested">
                                <div className="nostr-relay-suggested-header">
                                    <p>Relays sugeridos (NIP-65)</p>
                                    {suggestedNotAdded.length > 0 ? (
                                        <Button type="button" variant="outline" className="nostr-relay-add-suggested" onClick={handleAddAllSuggestedRelays}>
                                            Agregar todos
                                        </Button>
                                    ) : null}
                                </div>

                                {suggestedNotAdded.length > 0 ? (
                                    <ul className="nostr-relay-list">
                                        {suggestedNotAdded.map((relayUrl) => (
                                            <li key={`suggested-${relayUrl}`} className="nostr-relay-item">
                                                <span className="nostr-relay-url">{relayUrl}</span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="nostr-relay-remove"
                                                    onClick={() => handleAddSuggestedRelay(relayUrl)}
                                                >
                                                    Agregar
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="nostr-relays-help">Todos los relays sugeridos ya estan agregados.</p>
                                )}
                            </section>
                        ) : (
                            <p className="nostr-relays-help">No hay relays sugeridos todavia. Carga una npub para intentar descubrirlos via NIP-65.</p>
                        )}
                    </div>
                ) : (
                    <div className="nostr-shortcuts-content">
                        <p>Mantener pulsada la barra espaciadora y arrastrar para desplazarte por el mapa.</p>
                        <p>Mantener pulsado el wheel del raton y mover el raton para desplazarte por el mapa.</p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
