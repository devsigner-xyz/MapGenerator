import { useEffect, useRef, useState } from 'react';
import { addRelay, loadRelaySettings, removeRelay, saveRelaySettings, type RelaySettingsState } from '../../nostr/relay-settings';
import { normalizeRelayUrl } from '../../nostr/relay-policy';
import { loadUiSettings, saveUiSettings, type UiSettingsState } from '../../nostr/ui-settings';
import {
    addZapAmount,
    loadZapSettings,
    removeZapAmount,
    saveZapSettings,
    updateZapAmount,
    type ZapSettingsState,
} from '../../nostr/zap-settings';
import type { MapBridge } from '../map-bridge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface MapSettingsModalProps {
    mapBridge: MapBridge | null;
    suggestedRelays?: string[];
    onUiSettingsChange?: (nextState: UiSettingsState) => void;
    zapSettings?: ZapSettingsState;
    onZapSettingsChange?: (nextState: ZapSettingsState) => void;
    initialView?: SettingsView;
    hasActiveSession?: boolean;
    onLogoutSession?: () => Promise<void> | void;
    onClose: () => void;
}

export type SettingsView = 'settings' | 'ui' | 'shortcuts' | 'relays' | 'about' | 'zaps';

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

export function MapSettingsModal({
    mapBridge,
    suggestedRelays = [],
    onUiSettingsChange,
    zapSettings,
    onZapSettingsChange,
    initialView = 'settings',
    hasActiveSession = false,
    onLogoutSession,
    onClose,
}: MapSettingsModalProps) {
    const [view, setView] = useState<SettingsView>(initialView);
    const [relaySettings, setRelaySettings] = useState<RelaySettingsState>(() => loadRelaySettings());
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettingsState, setZapSettingsState] = useState<ZapSettingsState>(() => zapSettings ?? loadZapSettings());
    const [newRelayInput, setNewRelayInput] = useState('');
    const [newZapAmountInput, setNewZapAmountInput] = useState('');
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

    const persistZapSettings = (nextState: ZapSettingsState): void => {
        const savedState = saveZapSettings(nextState);
        setZapSettingsState(savedState);
        onZapSettingsChange?.(savedState);
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
        if (!zapSettings) {
            return;
        }

        setZapSettingsState(zapSettings);
    }, [zapSettings]);

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
                    {view === 'ui' || view === 'shortcuts' || view === 'relays' || view === 'about' || view === 'zaps' ? (
                        <Button type="button" variant="ghost" className="nostr-settings-back" onClick={() => setView('settings')}>
                            Volver
                        </Button>
                    ) : (
                        <span className="nostr-settings-spacer" aria-hidden="true" />
                    )}

                    <p className="nostr-settings-title">
                        {view === 'settings'
                            ? 'Settings'
                            : view === 'ui'
                                ? 'UI'
                                : view === 'shortcuts'
                                    ? 'Shortcuts'
                                    : view === 'relays'
                                        ? 'Relays'
                                        : view === 'zaps'
                                            ? 'Zaps'
                                            : 'About'}
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

                        <Button type="button" variant="outline" className="nostr-settings-item" onClick={() => setView('about')}>
                            About
                        </Button>

                        <Button type="button" variant="outline" className="nostr-settings-item" onClick={() => setView('zaps')}>
                            Zaps
                        </Button>

                        {hasActiveSession ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="nostr-settings-item nostr-settings-danger"
                                onClick={() => {
                                    void onLogoutSession?.();
                                    onClose();
                                }}
                            >
                                Cerrar sesión
                            </Button>
                        ) : null}

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
                            <Switch
                                id="nostr-street-labels-enabled"
                                size="sm"
                                aria-label="Street labels enabled"
                                checked={uiSettings.streetLabelsEnabled}
                                onCheckedChange={(checked) => {
                                    persistUiSettings({
                                        ...uiSettings,
                                        streetLabelsEnabled: checked,
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

                        <hr className="nostr-divider" />

                        <div className="nostr-ui-slider-row">
                            <label className="nostr-label" htmlFor="nostr-traffic-count">Cars in city</label>
                            <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesCount}</span>
                        </div>
                        <input
                            id="nostr-traffic-count"
                            className="nostr-input"
                            type="range"
                            min={0}
                            max={50}
                            step={1}
                            aria-label="Cars in city"
                            value={uiSettings.trafficParticlesCount}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }

                                persistUiSettings({
                                    ...uiSettings,
                                    trafficParticlesCount: nextValue,
                                });
                            }}
                        />

                        <div className="nostr-ui-slider-row">
                            <label className="nostr-label" htmlFor="nostr-traffic-speed">Cars speed</label>
                            <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesSpeed.toFixed(1)}x</span>
                        </div>
                        <input
                            id="nostr-traffic-speed"
                            className="nostr-input"
                            type="range"
                            min={0.2}
                            max={3}
                            step={0.1}
                            aria-label="Cars speed"
                            value={uiSettings.trafficParticlesSpeed}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }

                                persistUiSettings({
                                    ...uiSettings,
                                    trafficParticlesSpeed: nextValue,
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
                ) : view === 'about' ? (
                    <div className="nostr-shortcuts-content">
                        <div className="nostr-about-section">
                            <h4>NIPs soportadas</h4>
                            <ul>
                                <li>NIP-19 (npub)</li>
                                <li>NIP-65 (relays sugeridos)</li>
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
                ) : view === 'zaps' ? (
                    <div className="nostr-shortcuts-content">
                        <p>Cantidad de zaps</p>

                        <div className="nostr-zap-list">
                            {zapSettingsState.amounts.map((amount, index) => (
                                <div key={`zap-${index}-${amount}`} className="nostr-zap-item">
                                    <span>{amount} sats</span>
                                    <div className="nostr-zap-item-actions">
                                        <Input
                                            type="number"
                                            min={1}
                                            step={1}
                                            className="nostr-input"
                                            aria-label={`Cantidad zap ${index + 1}`}
                                            value={String(amount)}
                                            onChange={(event) => {
                                                const nextValue = Number(event.target.value);
                                                if (!Number.isFinite(nextValue)) {
                                                    return;
                                                }
                                                persistZapSettings(updateZapAmount(zapSettingsState, index, nextValue));
                                            }}
                                        />

                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => persistZapSettings(removeZapAmount(zapSettingsState, index))}
                                        >
                                            Quitar
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="nostr-zap-add-row">
                            <Input
                                type="number"
                                min={1}
                                step={1}
                                className="nostr-input"
                                aria-label="Nueva cantidad de zap"
                                placeholder="512"
                                value={newZapAmountInput}
                                onChange={(event) => setNewZapAmountInput(event.target.value)}
                            />
                            <Button
                                type="button"
                                className="nostr-submit"
                                onClick={() => {
                                    const nextValue = Number(newZapAmountInput.trim());
                                    if (!Number.isFinite(nextValue)) {
                                        return;
                                    }
                                    persistZapSettings(addZapAmount(zapSettingsState, nextValue));
                                    setNewZapAmountInput('');
                                }}
                            >
                                Agregar cantidad
                            </Button>
                        </div>
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
