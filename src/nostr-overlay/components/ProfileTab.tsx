import { useEffect, useMemo, useState } from 'react';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { AuthSessionState } from '../../nostr/auth/session';
import type { NostrProfile } from '../../nostr/types';
import { encodeHexToNpub } from '../../nostr/npub';
import { loadRelaySettings } from '../../nostr/relay-settings';
import { useRelayConnectionSummary, type RelayConnectionProbe } from '../hooks/useRelayConnectionSummary';
import { Nip05Identifier } from './Nip05Identifier';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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

function displayName(profile: NostrProfile | undefined, fallback: string): string {
    return profile?.displayName ?? profile?.name ?? fallback;
}

export function ProfileTab({
    ownerPubkey,
    ownerProfile,
    followsCount,
    followersCount,
    authSession,
    ownerVerification,
    relayConnectionProbe,
}: ProfileTabProps) {
    const [avatarLoadError, setAvatarLoadError] = useState(false);
    const relaySettings = loadRelaySettings();
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

    useEffect(() => {
        setAvatarLoadError(false);
    }, [ownerProfile?.picture]);

    if (!ownerPubkey) {
        return <div className="nostr-profile-tab" />;
    }

    const shortPubkey = `${ownerPubkey.slice(0, 10)}...${ownerPubkey.slice(-6)}`;
    let ownerNpub: string | undefined;
    try {
        ownerNpub = encodeHexToNpub(ownerPubkey);
    } catch {
        ownerNpub = undefined;
    }

    const pubkeyLabel = ownerNpub
        ? `${ownerNpub.slice(0, 14)}...${ownerNpub.slice(-6)}`
        : shortPubkey;

    return (
        <div className="nostr-profile-tab">
            <div className="nostr-profile-header">
                <div className="nostr-profile-header-main">
                    {ownerProfile?.picture && !avatarLoadError ? (
                        <Avatar className="nostr-profile-avatar">
                            <AvatarImage
                                src={ownerProfile.picture}
                                alt="Avatar de perfil"
                                onError={() => setAvatarLoadError(true)}
                            />
                            <AvatarFallback className="nostr-profile-avatar-fallback" aria-hidden="true">
                                {displayName(ownerProfile, ownerPubkey).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    ) : (
                        <Avatar className="nostr-profile-avatar">
                            <AvatarFallback className="nostr-profile-avatar-fallback" aria-hidden="true">
                                {displayName(ownerProfile, ownerPubkey).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    )}

                    <div>
                        <p className="nostr-profile-name nostr-identity-row">
                            <span className="truncate">{displayName(ownerProfile, shortPubkey)}</span>
                            <Nip05Identifier profile={ownerProfile} verification={ownerVerification} />
                        </p>
                        <p className="nostr-profile-pubkey">{pubkeyLabel}</p>
                    </div>
                </div>

            </div>

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
