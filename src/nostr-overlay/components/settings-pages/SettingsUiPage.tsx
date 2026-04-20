import type { UiSettingsState } from '../../../nostr/ui-settings';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { OverlayPageHeader } from '../OverlayPageHeader';

interface SettingsUiPageProps {
    uiSettings: UiSettingsState;
    onPersistUiSettings: (nextState: UiSettingsState) => void;
}

export function SettingsUiPage({ uiSettings, onPersistUiSettings }: SettingsUiPageProps) {
    return (
        <>
            <OverlayPageHeader
                title="Interfaz"
                description="Controles de visualizacion, etiquetas y trafico del mapa."
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-shortcuts-content">
                    <p>Configura el zoom minimo para mostrar avatar y nombre en edificios ocupados.</p>
                    <div className="flex items-center justify-between gap-2" data-testid="settings-ui-occupied-zoom-row">
                        <Label htmlFor="nostr-occupied-zoom-level">Zoom de etiquetas ocupadas</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.occupiedLabelsZoomLevel}</span>
                    </div>
                    <Slider
                        id="nostr-occupied-zoom-level"
                        aria-label="Zoom de etiquetas ocupadas"
                        min={1}
                        max={20}
                        step={1}
                        value={[uiSettings.occupiedLabelsZoomLevel]}
                        onValueChange={(values) => {
                            const nextValue = values[0] ?? Number.NaN;
                            if (!Number.isFinite(nextValue)) {
                                return;
                            }
                            onPersistUiSettings({
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

                    <div className="flex items-center justify-between gap-2" data-testid="settings-ui-street-labels-row">
                        <Label htmlFor="nostr-street-labels-enabled">Etiquetas de calles</Label>
                        <Switch
                            id="nostr-street-labels-enabled"
                            size="sm"
                            aria-label="Etiquetas de calles activadas"
                            checked={uiSettings.streetLabelsEnabled}
                            onCheckedChange={(checked) => {
                                onPersistUiSettings({
                                    ...uiSettings,
                                    streetLabelsEnabled: checked,
                                });
                            }}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="nostr-verified-buildings-overlay-enabled">Superposición de edificios verificados</Label>
                        <Switch
                            id="nostr-verified-buildings-overlay-enabled"
                            size="sm"
                            aria-label="Superposición de edificios verificados activada"
                            checked={uiSettings.verifiedBuildingsOverlayEnabled}
                            onCheckedChange={(checked) => {
                                onPersistUiSettings({
                                    ...uiSettings,
                                    verifiedBuildingsOverlayEnabled: checked,
                                });
                            }}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="nostr-street-zoom-level">Zoom de etiquetas de calles</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.streetLabelsZoomLevel}</span>
                    </div>
                    <Slider
                        id="nostr-street-zoom-level"
                        aria-label="Zoom de etiquetas de calles"
                        min={1}
                        max={20}
                        step={1}
                        disabled={!uiSettings.streetLabelsEnabled}
                        value={[uiSettings.streetLabelsZoomLevel]}
                        onValueChange={(values) => {
                            const nextValue = values[0] ?? Number.NaN;
                            if (!Number.isFinite(nextValue)) {
                                return;
                            }
                            onPersistUiSettings({
                                ...uiSettings,
                                streetLabelsZoomLevel: nextValue,
                            });
                        }}
                    />

                    <Separator className="nostr-divider" />

                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="nostr-traffic-count">Coches en ciudad</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesCount}</span>
                    </div>
                    <Slider
                        id="nostr-traffic-count"
                        min={0}
                        max={50}
                        step={1}
                        aria-label="Coches en ciudad"
                        value={[uiSettings.trafficParticlesCount]}
                        onValueChange={(values) => {
                            const nextValue = values[0] ?? Number.NaN;
                            if (!Number.isFinite(nextValue)) {
                                return;
                            }

                            onPersistUiSettings({
                                ...uiSettings,
                                trafficParticlesCount: nextValue,
                            });
                        }}
                    />

                    <div className="flex items-center justify-between gap-2" data-testid="settings-ui-traffic-speed-row">
                        <Label htmlFor="nostr-traffic-speed">Velocidad de coches</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesSpeed.toFixed(1)}x</span>
                    </div>
                    <Slider
                        id="nostr-traffic-speed"
                        min={0.2}
                        max={3}
                        step={0.1}
                        aria-label="Velocidad de coches"
                        value={[uiSettings.trafficParticlesSpeed]}
                        onValueChange={(values) => {
                            const nextValue = values[0] ?? Number.NaN;
                            if (!Number.isFinite(nextValue)) {
                                return;
                            }

                            onPersistUiSettings({
                                ...uiSettings,
                                trafficParticlesSpeed: nextValue,
                            });
                        }}
                    />
                </div>
            </div>
        </>
    );
}
