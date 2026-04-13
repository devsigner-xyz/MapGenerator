import { useMemo } from 'react';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { AuthSessionState } from '../../nostr/auth/session';
import type { NostrProfile } from '../../nostr/types';
import { loadRelaySettings } from '../../nostr/relay-settings';
import { useRelayConnectionSummary, type RelayConnectionProbe } from '../hooks/useRelayConnectionSummary';
import { Nip05Identifier } from './Nip05Identifier';

interface ProfileTabProps {
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    followsCount: number;
    followersCount: number;
    followersLoading?: boolean;
    authSession?: AuthSessionState;
    canWrite?: boolean;
    canEncrypt?: boolean;
    ownerVerification?: Nip05ValidationResult;
    relayConnectionProbe?: RelayConnectionProbe;
}

export function ProfileTab({
    ownerPubkey,
    ownerProfile,
    followsCount,
    followersCount,
    ownerVerification,
    relayConnectionProbe,
}: ProfileTabProps) {
    const relaySettings = loadRelaySettings({ ownerPubkey });
    const configuredRelayRows = [
        ...relaySettings.byType.nip65Both.map((relayUrl) => ({ relayUrl })),
        ...relaySettings.byType.nip65Read.map((relayUrl) => ({ relayUrl })),
        ...relaySettings.byType.nip65Write.map((relayUrl) => ({ relayUrl })),
        ...relaySettings.byType.dmInbox.map((relayUrl) => ({ relayUrl })),
    ];
    const configuredRelayRowsKey = configuredRelayRows
        .map(({ relayUrl }, index) => `${index}:${relayUrl}`)
        .join('|');
    const relayProbeTargets = useMemo(
        () => [...new Set(configuredRelayRows.map(({ relayUrl }) => relayUrl))],
        [configuredRelayRowsKey]
    );

    const { statusByRelay } = useRelayConnectionSummary(relayProbeTargets, {
        probe: relayConnectionProbe,
    });
    const connectedRelays = configuredRelayRows.reduce(
        (count, { relayUrl }) => count + (statusByRelay[relayUrl] === 'connected' ? 1 : 0),
        0
    );
    const checkingRelays = configuredRelayRows.reduce(
        (count, { relayUrl }) => count + (statusByRelay[relayUrl] === 'checking' ? 1 : 0),
        0
    );
    const totalRelays = configuredRelayRows.length;
    const disconnectedRelays = Math.max(0, totalRelays - connectedRelays - checkingRelays);

    if (!ownerPubkey) {
        return <div className="nostr-profile-tab" />;
    }

    return (
        <div className="nostr-profile-tab">
            <Nip05Identifier profile={ownerProfile} verification={ownerVerification} />

            <dl className="nostr-profile-stats">
                <div>
                    <dt>Sigues</dt>
                    <dd>{followsCount}</dd>
                </div>
                <div>
                    <dt>Seguidores</dt>
                    <dd>{followersCount}</dd>
                </div>
            </dl>

            <dl className="nostr-profile-relay-stats">
                <div>
                    <dt>Relays</dt>
                    <dd>{totalRelays}</dd>
                </div>
                <div>
                    <dt>Conectados</dt>
                    <dd>{connectedRelays}</dd>
                </div>
                <div>
                    <dt>Sin conexión</dt>
                    <dd>{disconnectedRelays}</dd>
                </div>
            </dl>
        </div>
    );
}
