import type { UiSettingsState } from '../../../nostr/ui-settings';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

interface SettingsUiPageProps {
    uiSettings: UiSettingsState;
    onPersistUiSettings: (nextState: UiSettingsState) => void;
}

export function SettingsUiPage({ uiSettings, onPersistUiSettings }: SettingsUiPageProps) {
    return (
        <>
            <header className="nostr-page-header">
                <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">Interfaz</h4>
                <p className="text-sm text-muted-foreground">Controles de visualizacion, etiquetas y trafico del mapa.</p>
            </header>
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-shortcuts-content">
                    <p>Configura el zoom minimo para mostrar avatar y nombre en edificios ocupados.</p>
                    <div className="nostr-ui-slider-row">
                        <Label className="nostr-label" htmlFor="nostr-occupied-zoom-level">Occupied labels zoom level</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.occupiedLabelsZoomLevel}</span>
                    </div>
                    <Slider
                        id="nostr-occupied-zoom-level"
                        aria-label="Occupied labels zoom level"
                        min={1}
                        max={20}
                        step={1}
                        value={[uiSettings.occupiedLabelsZoomLevel]}
                        onValueChange={(values) => {
                            const nextValue = values[0];
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

                    <div className="nostr-ui-toggle-row">
                        <Label className="nostr-label" htmlFor="nostr-street-labels-enabled">Street labels</Label>
                        <Switch
                            id="nostr-street-labels-enabled"
                            size="sm"
                            aria-label="Street labels enabled"
                            checked={uiSettings.streetLabelsEnabled}
                            onCheckedChange={(checked) => {
                                onPersistUiSettings({
                                    ...uiSettings,
                                    streetLabelsEnabled: checked,
                                });
                            }}
                        />
                    </div>

                    <div className="nostr-ui-toggle-row">
                        <Label className="nostr-label" htmlFor="nostr-verified-buildings-overlay-enabled">Verified buildings overlay</Label>
                        <Switch
                            id="nostr-verified-buildings-overlay-enabled"
                            size="sm"
                            aria-label="Verified buildings overlay enabled"
                            checked={uiSettings.verifiedBuildingsOverlayEnabled}
                            onCheckedChange={(checked) => {
                                onPersistUiSettings({
                                    ...uiSettings,
                                    verifiedBuildingsOverlayEnabled: checked,
                                });
                            }}
                        />
                    </div>

                    <div className="nostr-ui-slider-row">
                        <Label className="nostr-label" htmlFor="nostr-street-zoom-level">Street labels zoom level</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.streetLabelsZoomLevel}</span>
                    </div>
                    <Slider
                        id="nostr-street-zoom-level"
                        aria-label="Street labels zoom level"
                        min={1}
                        max={20}
                        step={1}
                        disabled={!uiSettings.streetLabelsEnabled}
                        value={[uiSettings.streetLabelsZoomLevel]}
                        onValueChange={(values) => {
                            const nextValue = values[0];
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

                    <div className="nostr-ui-slider-row">
                        <Label className="nostr-label" htmlFor="nostr-traffic-count">Cars in city</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesCount}</span>
                    </div>
                    <Slider
                        id="nostr-traffic-count"
                        min={0}
                        max={50}
                        step={1}
                        aria-label="Cars in city"
                        value={[uiSettings.trafficParticlesCount]}
                        onValueChange={(values) => {
                            const nextValue = values[0];
                            if (!Number.isFinite(nextValue)) {
                                return;
                            }

                            onPersistUiSettings({
                                ...uiSettings,
                                trafficParticlesCount: nextValue,
                            });
                        }}
                    />

                    <div className="nostr-ui-slider-row">
                        <Label className="nostr-label" htmlFor="nostr-traffic-speed">Cars speed</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesSpeed.toFixed(1)}x</span>
                    </div>
                    <Slider
                        id="nostr-traffic-speed"
                        min={0.2}
                        max={3}
                        step={0.1}
                        aria-label="Cars speed"
                        value={[uiSettings.trafficParticlesSpeed]}
                        onValueChange={(values) => {
                            const nextValue = values[0];
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
