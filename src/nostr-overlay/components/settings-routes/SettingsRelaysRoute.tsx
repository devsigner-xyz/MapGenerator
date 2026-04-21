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
        ...(ownerPubkey ? { ownerPubkey } : {}),
        ...(suggestedRelays ? { suggestedRelays } : {}),
        ...(suggestedRelaysByType ? { suggestedRelaysByType } : {}),
        ...(relayConnectionProbe ? { relayConnectionProbe } : {}),
        ...(relayConnectionRefreshIntervalMs !== undefined ? { relayConnectionRefreshIntervalMs } : {}),
    });

    return (
        <SettingsRelaysPage
            configuredRows={relays.configuredRows}
            suggestedRows={relays.suggestedRows}
            searchConfiguredRows={relays.searchConfiguredRows}
            searchSuggestedRows={relays.searchSuggestedRows}
            connectedConfiguredRelays={relays.connectedConfiguredRelays}
            disconnectedConfiguredRelays={relays.disconnectedConfiguredRelays}
            relayInfoByUrl={relays.relayInfoByUrl}
            configuredRelayConnectionStatusByRelay={relays.configuredRelayConnectionStatusByRelay}
            relayConnectionStatusByRelay={relays.relayConnectionStatusByRelay}
            relayTypeLabels={relays.relayTypeLabels}
            newRelayInput={relays.newRelayInput}
            newRelayType={relays.newRelayType}
            newSearchRelayInput={relays.newSearchRelayInput}
            invalidRelayInputs={relays.invalidRelayInputs}
            invalidSearchRelayInputs={relays.invalidSearchRelayInputs}
            onNewRelayInputChange={relays.onNewRelayInputChange}
            onNewRelayTypeChange={relays.onNewRelayTypeChange}
            onNewSearchRelayInputChange={relays.onNewSearchRelayInputChange}
            onAddRelays={relays.onAddRelays}
            onOpenRelayDetails={(relayUrl, source, relayType) => {
                navigate(buildRelayDetailPath({ relayUrl, source, relayType }));
            }}
            onRemoveRelay={relays.onRemoveRelay}
            onAddSuggestedRelay={relays.onAddSuggestedRelay}
            onAddAllSuggestedRelays={relays.onAddAllSuggestedRelays}
            onResetRelaysToDefault={relays.onResetRelaysToDefault}
            onAddSearchRelays={relays.onAddSearchRelays}
            onRemoveSearchRelay={relays.onRemoveSearchRelay}
            onAddSuggestedSearchRelay={relays.onAddSuggestedSearchRelay}
            onAddAllSuggestedSearchRelays={relays.onAddAllSuggestedSearchRelays}
            onResetSearchRelaysToDefault={relays.onResetSearchRelaysToDefault}
            onOpenRelayActionsMenu={relays.onOpenRelayActionsMenu}
            describeRelay={relays.describeRelay}
            relayAvatarFallback={relays.relayAvatarFallback}
            relayConnectionBadge={relays.relayConnectionBadge}
        />
    );
}
