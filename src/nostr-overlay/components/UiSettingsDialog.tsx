import type { UiSettingsState } from '../../nostr/ui-settings';
import { useI18n } from '@/i18n/useI18n';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SettingsUiPage } from './settings-pages/SettingsUiPage';

interface UiSettingsDialogProps {
    open: boolean;
    uiSettings: UiSettingsState;
    onPersistUiSettings: (nextState: UiSettingsState) => void;
    onOpenChange: (open: boolean) => void;
}

export function UiSettingsDialog({ open, uiSettings, onPersistUiSettings, onOpenChange }: UiSettingsDialogProps) {
    const { t } = useI18n();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogTitle className="sr-only">{t('settings.ui.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('settings.ui.description')}</DialogDescription>
                <SettingsUiPage uiSettings={uiSettings} onPersistUiSettings={onPersistUiSettings} />
            </DialogContent>
        </Dialog>
    );
}
