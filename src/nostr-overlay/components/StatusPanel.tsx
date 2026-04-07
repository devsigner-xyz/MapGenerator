import type { OverlayStatus } from '../hooks/useNostrOverlay';

interface StatusPanelProps {
    status: OverlayStatus;
    error?: string;
    followsCount: number;
    assignedCount: number;
}

export function StatusPanel({ status, error, followsCount, assignedCount }: StatusPanelProps) {
    if (status === 'loading_graph') {
        return <p className="nostr-status nostr-status-loading">Cargando red social desde Nostr...</p>;
    }

    if (status === 'loading_profiles') {
        return <p className="nostr-status nostr-status-loading">Cargando perfiles de cuentas...</p>;
    }

    if (status === 'assigning_map') {
        return <p className="nostr-status nostr-status-loading">Asignando cuentas a edificios...</p>;
    }

    if (status === 'loading_followers') {
        return <p className="nostr-status nostr-status-loading">Buscando seguidores en relays...</p>;
    }

    if (status === 'error') {
        return <p className="nostr-status nostr-status-error">{error || 'Error cargando datos de Nostr'}</p>;
    }

    if (status === 'success') {
        return (
            <p className="nostr-status nostr-status-success">
                {`${followsCount} / ${assignedCount}`}
            </p>
        );
    }

    return <p className="nostr-status">Introduce una npub para vincular seguidos con edificios.</p>;
}
