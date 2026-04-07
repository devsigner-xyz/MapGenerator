import { useEffect, useState } from 'react';
import type { NostrProfile } from '../../nostr/types';
import { encodeHexToNpub } from '../../nostr/npub';

interface ProfileTabProps {
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    followsCount: number;
    followersCount: number;
    followersLoading: boolean;
    onLocateOwner?: () => void;
    onCopyOwnerNpub?: (value: string) => void | Promise<void>;
}

function displayName(profile: NostrProfile | undefined, fallback: string): string {
    return profile?.displayName ?? profile?.name ?? fallback;
}

export function ProfileTab({
    ownerPubkey,
    ownerProfile,
    followsCount,
    followersCount,
    followersLoading,
    onLocateOwner,
    onCopyOwnerNpub,
}: ProfileTabProps) {
    const [avatarLoadError, setAvatarLoadError] = useState(false);

    useEffect(() => {
        setAvatarLoadError(false);
    }, [ownerProfile?.picture]);

    if (!ownerPubkey) {
        return <p className="nostr-empty">Introduce una npub para ver el perfil.</p>;
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
                        <img
                            className="nostr-profile-avatar"
                            src={ownerProfile.picture}
                            alt="Avatar de perfil"
                            onError={() => setAvatarLoadError(true)}
                        />
                    ) : (
                        <div className="nostr-profile-avatar nostr-profile-avatar-fallback" aria-hidden="true">
                            {displayName(ownerProfile, ownerPubkey).slice(0, 2).toUpperCase()}
                        </div>
                    )}

                    <div>
                        <p className="nostr-profile-name">{displayName(ownerProfile, shortPubkey)}</p>
                        <p className="nostr-profile-pubkey">{pubkeyLabel}</p>
                    </div>
                </div>

                <div className="nostr-profile-actions" aria-label="Acciones de perfil">
                    <button
                        type="button"
                        className="nostr-icon-button"
                        aria-label="Ubicarme en el mapa"
                        title="Locate on map"
                        onClick={onLocateOwner}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="12" cy="11" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        className="nostr-icon-button"
                        aria-label="Copiar npub"
                        title="Copy npub"
                        onClick={() => {
                            void onCopyOwnerNpub?.(ownerNpub || ownerPubkey);
                        }}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <rect x="9" y="9" width="11" height="11" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
                            <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
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

            {followersLoading ? <p className="nostr-loading">Buscando seguidores en relays...</p> : null}
        </div>
    );
}
