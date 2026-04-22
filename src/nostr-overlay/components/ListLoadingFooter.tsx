import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/i18n/useI18n';

interface ListLoadingFooterProps {
    loading: boolean;
    label?: string;
}

export function ListLoadingFooter({ loading, label = 'Cargando mas...' }: ListLoadingFooterProps) {
    const { t } = useI18n();
    if (!loading) {
        return null;
    }

    return (
        <div className="nostr-list-loading-footer" role="status" aria-live="polite">
            <Spinner />
            <span>{label === 'Cargando mas...' ? t('listLoadingFooter.default') : label}</span>
        </div>
    );
}
