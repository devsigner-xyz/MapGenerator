import type { RefObject } from 'react';
import { OverlayPageHeader } from '../OverlayPageHeader';
import { useI18n } from '@/i18n/useI18n';

interface SettingsAdvancedPageProps {
    settingsHostRef: RefObject<HTMLDivElement | null>;
}

export function SettingsAdvancedPage({ settingsHostRef }: SettingsAdvancedPageProps) {
    const { t } = useI18n();

    return (
        <>
            <OverlayPageHeader
                title={t('settings.advanced.title')}
                description={t('settings.advanced.description')}
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-shortcuts-content">
                    <p>{t('settings.advanced.body')}</p>
                    <div ref={settingsHostRef} className="nostr-settings-host" />
                </div>
            </div>
        </>
    );
}
