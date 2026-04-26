import { OverlayPageHeader } from '../OverlayPageHeader';
import { useI18n } from '@/i18n/useI18n';

export function SettingsShortcutsPage() {
    const { t } = useI18n();

    return (
        <>
            <OverlayPageHeader
                title={t('settings.shortcuts.title')}
                description={t('settings.shortcuts.description')}
            />
            <div className="nostr-settings-body grid min-h-0 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-settings-form nostr-shortcuts-content">
                    <div className="nostr-settings-section grid gap-3">
                        <p>{t('settings.shortcuts.spacePan')}</p>
                        <p>{t('settings.shortcuts.middlePan')}</p>
                    </div>
                </div>
            </div>
        </>
    );
}
