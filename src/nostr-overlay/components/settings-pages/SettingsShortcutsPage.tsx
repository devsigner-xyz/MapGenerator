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
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-shortcuts-content">
                    <p>{t('settings.shortcuts.spacePan')}</p>
                    <p>{t('settings.shortcuts.middlePan')}</p>
                </div>
            </div>
        </>
    );
}
