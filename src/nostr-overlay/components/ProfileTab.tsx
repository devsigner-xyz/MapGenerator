import { useEffect, useMemo, useState } from 'react';
import type { EasterEggId } from '../../ts/ui/easter_eggs';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { AuthSessionState } from '../../nostr/auth/session';
import type { NostrProfile } from '../../nostr/types';
import { encodeHexToNpub } from '../../nostr/npub';
import { loadRelaySettings } from '../../nostr/relay-settings';
import { useRelayConnectionSummary, type RelayConnectionProbe } from '../hooks/useRelayConnectionSummary';
import { EASTER_EGG_MISSIONS } from '../easter-eggs/missions';
import { Nip05Identifier } from './Nip05Identifier';
import { Button } from '@/components/ui/button';
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
    easterEggDiscoveredIds?: EasterEggId[];
    onOpenMissions?: () => void;
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
    easterEggDiscoveredIds = [],
    onOpenMissions,
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
    const discoveredIds = useMemo(() => new Set(easterEggDiscoveredIds), [easterEggDiscoveredIds]);
    const discoveredMissionsCount = useMemo(
        () => EASTER_EGG_MISSIONS.reduce(
            (count, mission) => count + (discoveredIds.has(mission.id) ? 1 : 0),
            0
        ),
        [discoveredIds]
    );

    useEffect(() => {
        setAvatarLoadError(false);
    }, [ownerProfile?.picture]);

    if (!ownerPubkey) {
        return (
            <div className="nostr-profile-tab">
                <p className="nostr-auth-hint">
                    {authSession
                        ? authSession.readonly
                            ? 'Modo solo lectura. Inicia sesion con nsec o extension para interactuar con Nostr.'
                            : authSession.locked
                                ? 'Sesion bloqueada. Desbloquea para seguir, publicar y enviar mensajes privados.'
                                : 'Sesion lista para seguir, publicar y enviar mensajes privados.'
                        : 'Elige un metodo de login para continuar.'}
                </p>
            </div>
        );
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

            <section className="nostr-profile-missions" aria-label="Misiones">
                <header className="nostr-profile-missions-header">
                    <div>
                        <h3>Misiones</h3>
                        <p>{discoveredMissionsCount} / {EASTER_EGG_MISSIONS.length} descubiertos</p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenMissions?.()}
                    >
                        Misiones
                    </Button>
                </header>

                <ul className="nostr-profile-missions-list">
                    {EASTER_EGG_MISSIONS.map((mission) => {
                        const discovered = discoveredIds.has(mission.id);
                        return (
                            <li key={mission.id} className="nostr-profile-missions-item">
                                <span>{mission.label}</span>
                                <span className={`nostr-profile-missions-status${discovered ? ' is-discovered' : ''}`}>
                                    {discovered ? 'Encontrado' : 'Pendiente'}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}
