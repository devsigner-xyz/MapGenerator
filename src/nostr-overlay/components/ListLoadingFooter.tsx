import { Spinner } from '@/components/ui/spinner';

interface ListLoadingFooterProps {
    loading: boolean;
    label?: string;
}

export function ListLoadingFooter({ loading, label = 'Cargando mas...' }: ListLoadingFooterProps) {
    if (!loading) {
        return null;
    }

    return (
        <div className="nostr-list-loading-footer" role="status" aria-live="polite">
            <Spinner className="nostr-list-loading-spinner" />
            <span>{label}</span>
        </div>
    );
}
