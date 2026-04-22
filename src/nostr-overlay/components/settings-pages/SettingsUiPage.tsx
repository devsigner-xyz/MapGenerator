import type { UiSettingsState } from '../../../nostr/ui-settings';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useI18n } from '@/i18n/useI18n';
import { OverlayPageHeader } from '../OverlayPageHeader';

interface SettingsUiPageProps {
    uiSettings: UiSettingsState;
    onPersistUiSettings: (nextState: UiSettingsState) => void;
}

export function SettingsUiPage({ uiSettings, onPersistUiSettings }: SettingsUiPageProps) {
    const { t } = useI18n();

    return (
        <>
            <OverlayPageHeader
                title={t('settings.ui.title')}
                description={t('settings.ui.description')}
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-shortcuts-content">
                    <div className="grid gap-2" data-testid="settings-ui-language-row">
                        <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="nostr-ui-language">{t('settings.ui.language.label')}</Label>
                        </div>
                        <Select
                            value={uiSettings.language}
                            onValueChange={(value) => {
                                if (value !== 'es' && value !== 'en') {
                                    return;
                                }

                                onPersistUiSettings({
                                    ...uiSettings,
                                    language: value,
                                });
                            }}
                        >
                            <SelectTrigger id="nostr-ui-language" className="w-full">
                                <SelectValue placeholder={t('settings.ui.language.label')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="es">{t('settings.ui.language.es')}</SelectItem>
                                    <SelectItem value="en">{t('settings.ui.language.en')}</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    <Separator className="nostr-divider" />

                    <p>{t('settings.ui.occupiedIntro')}</p>
                    <div className="flex items-center justify-between gap-2" data-testid="settings-ui-occupied-zoom-row">
                        <Label htmlFor="nostr-occupied-zoom-level">{t('settings.ui.occupiedZoom')}</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.occupiedLabelsZoomLevel}</span>
                    </div>
                    <Slider
                        id="nostr-occupied-zoom-level"
                        aria-label={t('settings.ui.occupiedZoom')}
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
                        <Label htmlFor="nostr-street-labels-enabled">{t('settings.ui.streetLabels')}</Label>
                        <Switch
                            id="nostr-street-labels-enabled"
                            size="sm"
                            aria-label={t('settings.ui.streetLabelsEnabled')}
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
                        <Label htmlFor="nostr-verified-buildings-overlay-enabled">{t('settings.ui.verifiedBuildings')}</Label>
                        <Switch
                            id="nostr-verified-buildings-overlay-enabled"
                            size="sm"
                            aria-label={t('settings.ui.verifiedBuildingsEnabled')}
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
                        <Label htmlFor="nostr-street-zoom-level">{t('settings.ui.streetZoom')}</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.streetLabelsZoomLevel}</span>
                    </div>
                    <Slider
                        id="nostr-street-zoom-level"
                        aria-label={t('settings.ui.streetZoom')}
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

                    <div className="grid gap-2" data-testid="settings-ui-agora-layout">
                        <div className="flex items-center justify-between gap-2">
                            <Label>{t('settings.ui.agoraLayout')}</Label>
                        </div>
                        <ToggleGroup
                            type="single"
                            variant="outline"
                            size="sm"
                            value={uiSettings.agoraFeedLayout}
                            onValueChange={(value) => {
                                if (value !== 'list' && value !== 'masonry') {
                                    return;
                                }

                                onPersistUiSettings({
                                    ...uiSettings,
                                    agoraFeedLayout: value,
                                });
                            }}
                        >
                            <ToggleGroupItem value="list" aria-label={t('settings.ui.agoraLayoutListAria')}>
                                {t('settings.ui.agoraLayoutList')}
                            </ToggleGroupItem>
                            <ToggleGroupItem value="masonry" aria-label={t('settings.ui.agoraLayoutMasonryAria')}>
                                Masonry
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    <Separator className="nostr-divider" />

                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="nostr-traffic-count">{t('settings.ui.trafficCount')}</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesCount}</span>
                    </div>
                    <Slider
                        id="nostr-traffic-count"
                        min={0}
                        max={50}
                        step={1}
                        aria-label={t('settings.ui.trafficCount')}
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
                        <Label htmlFor="nostr-traffic-speed">{t('settings.ui.trafficSpeed')}</Label>
                        <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesSpeed.toFixed(1)}x</span>
                    </div>
                    <Slider
                        id="nostr-traffic-speed"
                        min={0.2}
                        max={3}
                        step={0.1}
                        aria-label={t('settings.ui.trafficSpeed')}
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
