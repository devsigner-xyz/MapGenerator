import { useNavigate } from 'react-router';
import { SettingsRelaysPage } from '../settings-pages/SettingsRelaysPage';
import { buildRelayDetailPath } from '../../settings/relay-detail-routing';
import { useSettingsRouteContext } from './settings-route-context';
import { useRelaysSettingsController } from './controllers/useRelaysSettingsController';

export function SettingsRelaysRoute() {
    const navigate = useNavigate();
    const {
        ownerPubkey,
        suggestedRelays,
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
    } = useSettingsRouteContext();
    const relays = useRelaysSettingsController({
        ownerPubkey,
        suggestedRelays,
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
    });

    return (
        <SettingsRelaysPage
            configuredRows={relays.configuredRows}
            suggestedRows={relays.suggestedRows}
            connectedConfiguredRelays={relays.connectedConfiguredRelays}
            disconnectedConfiguredRelays={relays.disconnectedConfiguredRelays}
            relayInfoByUrl={relays.relayInfoByUrl}
            configuredRelayConnectionStatusByRelay={relays.configuredRelayConnectionStatusByRelay}
            relayConnectionStatusByRelay={relays.relayConnectionStatusByRelay}
            relayTypeLabels={relays.relayTypeLabels}
            newRelayInput={relays.newRelayInput}
            newRelayType={relays.newRelayType}
            invalidRelayInputs={relays.invalidRelayInputs}
            onNewRelayInputChange={relays.onNewRelayInputChange}
            onNewRelayTypeChange={relays.onNewRelayTypeChange}
            onAddRelays={relays.onAddRelays}
            onOpenRelayDetails={(relayUrl, source, relayType) => {
                navigate(buildRelayDetailPath({ relayUrl, source, relayType }));
            }}
            onRemoveRelay={relays.onRemoveRelay}
            onAddSuggestedRelay={relays.onAddSuggestedRelay}
            onAddAllSuggestedRelays={relays.onAddAllSuggestedRelays}
            onResetRelaysToDefault={relays.onResetRelaysToDefault}
            onOpenRelayActionsMenu={relays.onOpenRelayActionsMenu}
            describeRelay={relays.describeRelay}
            relayAvatarFallback={relays.relayAvatarFallback}
            relayConnectionBadge={relays.relayConnectionBadge}
        />
    );
}
