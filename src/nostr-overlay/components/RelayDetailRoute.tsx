import { Navigate, useLocation, useNavigate } from 'react-router';
import type { RelaySettingsByType } from '../../nostr/relay-settings';
import type { RelayConnectionProbe } from '../hooks/useRelayConnectionSummary';
import { parseRelayDetailSearch } from '../settings/relay-detail-routing';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { SettingsRelayDetailPage } from './settings-pages/SettingsRelayDetailPage';
import { useRelayDetailController } from './settings-routes/controllers/useRelayDetailController';

interface RelayDetailRouteProps {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
}

export function RelayDetailRoute({
    ownerPubkey,
    suggestedRelays,
    suggestedRelaysByType,
    relayConnectionProbe,
    relayConnectionRefreshIntervalMs,
}: RelayDetailRouteProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const params = parseRelayDetailSearch(location.search);
    const fallbackParams = params ?? {
        relayUrl: '',
        source: 'configured' as const,
        relayType: 'nip65Both' as const,
    };

    const relayDetail = useRelayDetailController({
        ...(ownerPubkey ? { ownerPubkey } : {}),
        ...(suggestedRelays ? { suggestedRelays } : {}),
        ...(suggestedRelaysByType ? { suggestedRelaysByType } : {}),
        ...(relayConnectionProbe ? { relayConnectionProbe } : {}),
        ...(relayConnectionRefreshIntervalMs !== undefined ? { relayConnectionRefreshIntervalMs } : {}),
        params: fallbackParams,
    });

    if (!params) {
        return <Navigate to="/relays" replace />;
    }

    return (
        <section className="nostr-routed-surface" aria-label="Detalle de relay">
            <div className="nostr-routed-surface-content">
                <div className="nostr-settings-page nostr-routed-surface-panel nostr-page-layout nostr-settings-page-relays">
                    <h2 className="sr-only">Detalle de relay</h2>
                    <p className="sr-only">Información y estado de un relay.</p>

                    <SettingsRelayDetailPage
                        selectedRelay={relayDetail.selectedRelay}
                        activeRelayTypes={relayDetail.activeRelayTypes}
                        selectedRelayDetails={relayDetail.selectedRelayDetails}
                        {...(relayDetail.selectedRelayInfo ? { selectedRelayInfo: relayDetail.selectedRelayInfo } : {})}
                        {...(relayDetail.selectedRelayDocument ? { selectedRelayDocument: relayDetail.selectedRelayDocument } : {})}
                        selectedRelayAdminIdentity={relayDetail.selectedRelayAdminIdentity}
                        selectedRelayConnectionStatus={relayDetail.selectedRelayConnectionStatus}
                        relayHasNip11Metadata={relayDetail.relayHasNip11Metadata}
                        {...(relayDetail.relayEventLimit !== undefined ? { relayEventLimit: relayDetail.relayEventLimit } : {})}
                        relayHasFees={relayDetail.relayHasFees}
                        copiedRelayIdentityKey={relayDetail.copiedRelayIdentityKey}
                        relayTypeLabels={relayDetail.relayTypeLabels}
                        relayAvatarFallback={relayDetail.relayAvatarFallback}
                        relayConnectionBadge={relayDetail.relayConnectionBadge}
                        formatRelayFee={relayDetail.formatRelayFee}
                        onCopyRelayIdentity={relayDetail.onCopyRelayIdentity}
                    />

                    <DialogFooter className="sm:justify-start">
                        <Button type="button" variant="outline" onClick={() => navigate('/relays')}>
                            Volver
                        </Button>
                    </DialogFooter>
                </div>
            </div>
        </section>
    );
}
