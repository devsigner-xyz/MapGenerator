import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { SettingsRelayDetailPage } from '../settings-pages/SettingsRelayDetailPage';
import { parseRelayDetailSearch } from '../../settings/relay-detail-routing';
import { useSettingsRouteContext } from './settings-route-context';
import { useRelayDetailController } from './controllers/useRelayDetailController';

export function SettingsRelayDetailRoute() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = parseRelayDetailSearch(location.search);
    const fallbackParams = params ?? {
        relayUrl: '',
        source: 'configured' as const,
        relayType: 'nip65Both' as const,
    };
    const {
        ownerPubkey,
        suggestedRelays,
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
    } = useSettingsRouteContext();
    const relayDetail = useRelayDetailController({
        ownerPubkey,
        suggestedRelays,
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
        params: fallbackParams,
    });

    if (!params) {
        return <Navigate to="/settings/relays" replace />;
    }

    return (
        <>
            <SettingsRelayDetailPage
                selectedRelay={relayDetail.selectedRelay}
                selectedRelayDetails={relayDetail.selectedRelayDetails}
                selectedRelayInfo={relayDetail.selectedRelayInfo}
                selectedRelayDocument={relayDetail.selectedRelayDocument}
                selectedRelayAdminIdentity={relayDetail.selectedRelayAdminIdentity}
                selectedRelayConnectionStatus={relayDetail.selectedRelayConnectionStatus}
                relayHasNip11Metadata={relayDetail.relayHasNip11Metadata}
                relayEventLimit={relayDetail.relayEventLimit}
                relayHasFees={relayDetail.relayHasFees}
                copiedRelayIdentityKey={relayDetail.copiedRelayIdentityKey}
                relayTypeLabels={relayDetail.relayTypeLabels}
                relayAvatarFallback={relayDetail.relayAvatarFallback}
                relayConnectionBadge={relayDetail.relayConnectionBadge}
                formatRelayFee={relayDetail.formatRelayFee}
                onCopyRelayIdentity={relayDetail.onCopyRelayIdentity}
            />

            <DialogFooter className="sm:justify-start">
                <Button type="button" variant="outline" onClick={() => navigate('/settings/relays')}>
                    Volver
                </Button>
            </DialogFooter>
        </>
    );
}
