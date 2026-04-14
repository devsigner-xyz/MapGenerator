import { useNavigate } from 'react-router';
import type { RelaySettingsByType, RelaySettingsState } from '../../nostr/relay-settings';
import type { RelayConnectionProbe } from '../hooks/useRelayConnectionSummary';
import { buildRelayDetailPath } from '../settings/relay-detail-routing';
import { SettingsRelaysPage } from './settings-pages/SettingsRelaysPage';
import { useRelaysSettingsController } from './settings-routes/controllers/useRelaysSettingsController';

interface RelaysRouteProps {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    onRelaySettingsChange?: (nextState: RelaySettingsState) => void;
}

export function RelaysRoute({
    ownerPubkey,
    suggestedRelays,
    suggestedRelaysByType,
    relayConnectionProbe,
    relayConnectionRefreshIntervalMs,
    onRelaySettingsChange,
}: RelaysRouteProps) {
    const navigate = useNavigate();
    const relays = useRelaysSettingsController({
        ownerPubkey,
        suggestedRelays,
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
        onRelaySettingsChange,
    });

    return (
        <section className="nostr-routed-surface" aria-label="Relays">
            <div className="nostr-routed-surface-content">
                <div className="nostr-settings-page nostr-routed-surface-panel nostr-page-layout nostr-settings-page-relays">
                    <h2 className="sr-only">Relays</h2>
                    <p className="sr-only">Configuracion y estado de conexion de relays.</p>

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
                </div>
            </div>
        </section>
    );
}
