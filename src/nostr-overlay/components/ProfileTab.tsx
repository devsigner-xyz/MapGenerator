import type { NostrProfile } from '../../nostr/types';

interface ProfileTabProps {
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    followsCount: number;
    followersCount: number;
    followersLoading: boolean;
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
}: ProfileTabProps) {
    if (!ownerPubkey) {
        return <p className="nostr-empty">Introduce una npub para ver el perfil.</p>;
    }

    const shortPubkey = `${ownerPubkey.slice(0, 10)}...${ownerPubkey.slice(-6)}`;

    return (
        <div className="nostr-profile-tab">
            <div className="nostr-profile-header">
                {ownerProfile?.picture ? (
                    <img className="nostr-profile-avatar" src={ownerProfile.picture} alt="Avatar de perfil" />
                ) : (
                    <div className="nostr-profile-avatar nostr-profile-avatar-fallback" aria-hidden="true">
                        {displayName(ownerProfile, ownerPubkey).slice(0, 2).toUpperCase()}
                    </div>
                )}

                <div>
                    <p className="nostr-profile-name">{displayName(ownerProfile, shortPubkey)}</p>
                    <p className="nostr-profile-pubkey">{shortPubkey}</p>
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
