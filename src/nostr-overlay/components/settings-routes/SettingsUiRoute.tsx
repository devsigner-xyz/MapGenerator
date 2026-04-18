import { SettingsUiPage } from '../settings-pages/SettingsUiPage';
import { useSettingsRouteContext } from './settings-route-context';
import { useUiSettingsController } from './controllers/useUiSettingsController';

export function SettingsUiRoute() {
    const { onUiSettingsChange } = useSettingsRouteContext();
    const { uiSettings, persistUiSettings } = useUiSettingsController(
        onUiSettingsChange ? { onUiSettingsChange } : {}
    );

    return <SettingsUiPage uiSettings={uiSettings} onPersistUiSettings={persistUiSettings} />;
}
