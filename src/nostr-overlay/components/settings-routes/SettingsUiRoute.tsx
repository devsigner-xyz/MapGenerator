import { useEffect, useState } from 'react';
import { SettingsUiPage } from '../settings-pages/SettingsUiPage';
import { useSettingsRouteContext } from './settings-route-context';
import { useUiSettingsController } from './controllers/useUiSettingsController';

export function SettingsUiRoute() {
    const { mapBridge, onUiSettingsChange } = useSettingsRouteContext();
    const { uiSettings, persistUiSettings } = useUiSettingsController(
        onUiSettingsChange ? { onUiSettingsChange } : {}
    );
    const [mapColourScheme, setMapColourScheme] = useState<string | undefined>(() => mapBridge?.getColourScheme?.());
    const mapColourSchemeNames = mapBridge?.listColourSchemes?.() ?? [];

    useEffect(() => {
        setMapColourScheme(mapBridge?.getColourScheme?.());
    }, [mapBridge, uiSettings.theme]);

    return (
        <SettingsUiPage
            uiSettings={uiSettings}
            onPersistUiSettings={persistUiSettings}
            mapColourScheme={mapColourScheme}
            mapColourSchemeNames={mapColourSchemeNames}
            onMapColourSchemeChange={(scheme) => {
                mapBridge?.setColourScheme?.(scheme);
                setMapColourScheme(scheme);
            }}
        />
    );
}
