import { SettingsAdvancedPage } from '../settings-pages/SettingsAdvancedPage';
import { useSettingsRouteContext } from './settings-route-context';
import { useAdvancedSettingsController } from './controllers/useAdvancedSettingsController';

export function SettingsAdvancedRoute() {
    const { mapBridge } = useSettingsRouteContext();
    const { settingsHostRef } = useAdvancedSettingsController({ mapBridge });

    return <SettingsAdvancedPage settingsHostRef={settingsHostRef} />;
}
