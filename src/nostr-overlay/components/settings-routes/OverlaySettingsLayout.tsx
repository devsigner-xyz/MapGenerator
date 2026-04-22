import { Outlet } from 'react-router';
import { useI18n } from '@/i18n/useI18n';
import type { SettingsRouteContextValue } from './settings-route-context';

type OverlaySettingsLayoutProps = SettingsRouteContextValue;

export function OverlaySettingsLayout(contextValue: OverlaySettingsLayoutProps) {
    const { t } = useI18n();

    return (
        <section className="nostr-routed-surface" aria-label={t('settings.layout.aria')}>
            <div className="nostr-routed-surface-content">
                <div className="nostr-settings-page nostr-routed-surface-panel nostr-page-layout">
                    <h2 className="sr-only">{t('settings.layout.title')}</h2>
                    <p className="sr-only">{t('settings.layout.description')}</p>
                    <Outlet context={contextValue} />
                </div>
            </div>
        </section>
    );
}
