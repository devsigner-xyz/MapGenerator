import { useMemo } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface MapDisplayToggleControlsProps {
    carsEnabled: boolean;
    streetLabelsEnabled: boolean;
    specialMarkersEnabled: boolean;
    onCarsEnabledChange: (enabled: boolean) => void;
    onStreetLabelsEnabledChange: (enabled: boolean) => void;
    onSpecialMarkersEnabledChange: (enabled: boolean) => void;
}

export function MapDisplayToggleControls({
    carsEnabled,
    streetLabelsEnabled,
    specialMarkersEnabled,
    onCarsEnabledChange,
    onStreetLabelsEnabledChange,
    onSpecialMarkersEnabledChange,
}: MapDisplayToggleControlsProps) {
    const { t } = useI18n();
    const activeValues = useMemo(() => {
        const values: string[] = [];
        if (carsEnabled) {
            values.push('cars');
        }
        if (streetLabelsEnabled) {
            values.push('street-labels');
        }
        if (specialMarkersEnabled) {
            values.push('special-markers');
        }
        return values;
    }, [carsEnabled, specialMarkersEnabled, streetLabelsEnabled]);

    const onValueChange = (nextValues: string[]): void => {
        const nextCarsEnabled = nextValues.includes('cars');
        const nextStreetLabelsEnabled = nextValues.includes('street-labels');
        const nextSpecialMarkersEnabled = nextValues.includes('special-markers');

        if (nextCarsEnabled !== carsEnabled) {
            onCarsEnabledChange(nextCarsEnabled);
        }
        if (nextStreetLabelsEnabled !== streetLabelsEnabled) {
            onStreetLabelsEnabledChange(nextStreetLabelsEnabled);
        }
        if (nextSpecialMarkersEnabled !== specialMarkersEnabled) {
            onSpecialMarkersEnabledChange(nextSpecialMarkersEnabled);
        }
    };

    return (
        <div className="nostr-map-display-controls" aria-label={t('mapDisplay.controls')}>
            <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                value={activeValues}
                onValueChange={onValueChange}
                className="nostr-map-display-toggle-group"
            >
                <ToggleGroupItem className="nostr-map-display-toggle-button" value="cars" aria-label={t('mapDisplay.toggleCars')} title={t('mapDisplay.cars')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M6.8 7.8 8.3 5h7.4l1.5 2.8h.9A2.9 2.9 0 0 1 21 10.7v5.1a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-5.1a2.9 2.9 0 0 1 2.9-2.9Zm1.6 0h7.2L14.6 6H9.4ZM6.5 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm11 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" fill="currentColor" />
                    </svg>
                </ToggleGroupItem>

                <ToggleGroupItem className="nostr-map-display-toggle-button" value="street-labels" aria-label={t('mapDisplay.toggleStreetLabels')} title={t('mapDisplay.streetLabels')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h7A2.5 2.5 0 0 1 15 6.5V7h3.5A2.5 2.5 0 0 1 21 9.5v3A2.5 2.5 0 0 1 18.5 15H15v4.5a.5.5 0 0 1-.8.4L12 18.3l-2.2 1.6a.5.5 0 0 1-.8-.4V15H5.5A2.5 2.5 0 0 1 3 12.5Zm2.5-1a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H10a.75.75 0 0 1 .75.75v3.78l.95-.68a.5.5 0 0 1 .6 0l.95.68V14.25A.75.75 0 0 1 14 13.5h4.5a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1H14a.75.75 0 0 1-.75-.75v-1.25a1 1 0 0 0-1-1Z" fill="currentColor" />
                    </svg>
                </ToggleGroupItem>

                <ToggleGroupItem className="nostr-map-display-toggle-button" value="special-markers" aria-label={t('mapDisplay.toggleSpecialIcons')} title={t('mapDisplay.specialIcons')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 2.5a1 1 0 0 1 .94.67l1.26 3.74h3.95a1 1 0 0 1 .58 1.82l-3.2 2.33 1.23 3.76a1 1 0 0 1-1.54 1.12L12 13.66l-3.22 2.28a1 1 0 0 1-1.54-1.12l1.23-3.76-3.2-2.33a1 1 0 0 1 .58-1.82h3.95l1.26-3.74A1 1 0 0 1 12 2.5Z" fill="currentColor" />
                    </svg>
                </ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}
