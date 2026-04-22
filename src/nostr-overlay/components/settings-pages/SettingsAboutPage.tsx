import { OverlayPageHeader } from '../OverlayPageHeader';
import { useI18n } from '@/i18n/useI18n';

export function SettingsAboutPage() {
    const { t } = useI18n();

    return (
        <>
            <OverlayPageHeader
                title={t('settings.about.title')}
                description={t('settings.about.description')}
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-shortcuts-content">
                    <div className="nostr-about-section">
                        <h4>{t('settings.about.supportedNips')}</h4>
                        <ul>
                            <li>NIP-19 (npub)</li>
                            <li>NIP-65 (relay list metadata)</li>
                            <li>NIP-17 (DM inbox relays)</li>
                            <li>{t('settings.about.profileMetadata')}</li>
                            <li>{t('settings.about.posts')}</li>
                            <li>{t('settings.about.follows')}</li>
                        </ul>
                    </div>

                    <div className="nostr-about-section">
                        <h4>{t('settings.about.features')}</h4>
                        <ul>
                            <li>{t('settings.about.feature.overlay')}</li>
                            <li>{t('settings.about.feature.focus')}</li>
                            <li>{t('settings.about.feature.progressiveLoad')}</li>
                            <li>{t('settings.about.feature.relaySettings')}</li>
                            <li>{t('settings.about.feature.cityStats')}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
}
