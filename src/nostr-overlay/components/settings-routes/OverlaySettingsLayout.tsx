import { Outlet } from 'react-router';
import { useI18n } from '@/i18n/useI18n';
import type { SettingsRouteContextValue } from './settings-route-context';
import { OverlaySurface } from '../OverlaySurface';

type OverlaySettingsLayoutProps = SettingsRouteContextValue;

export function OverlaySettingsLayout(contextValue: OverlaySettingsLayoutProps) {
    const { t } = useI18n();

    return (
        <OverlaySurface ariaLabel={t('settings.layout.aria')}>
            <div>
                <div className="nostr-settings-page nostr-routed-surface-panel nostr-page-layout">
                    <Outlet context={contextValue} />
                </div>
            </div>
        </OverlaySurface>
    );
}
