import type { NostrProfile } from '../../nostr/types';

interface OccupantProfileModalProps {
    pubkey: string;
    profile?: NostrProfile;
    onClose: () => void;
}

function resolveName(pubkey: string, profile?: NostrProfile): string {
    return profile?.displayName ?? profile?.name ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

export function OccupantProfileModal({ pubkey, profile, onClose }: OccupantProfileModalProps) {
    const shortPubkey = `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;

    return (
        <div className="nostr-modal-backdrop" role="presentation" onClick={onClose}>
            <div className="nostr-modal" role="dialog" aria-modal="true" aria-label="Perfil del ocupante" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="nostr-modal-close" onClick={onClose} aria-label="Cerrar perfil">
                    ×
                </button>

                <div className="nostr-modal-header">
                    {profile?.picture ? (
                        <img className="nostr-modal-avatar" src={profile.picture} alt="Avatar del ocupante" />
                    ) : (
                        <div className="nostr-modal-avatar nostr-modal-avatar-fallback" aria-hidden="true">
                            {resolveName(pubkey, profile).slice(0, 2).toUpperCase()}
                        </div>
                    )}

                    <div>
                        <p className="nostr-modal-name">{resolveName(pubkey, profile)}</p>
                        <p className="nostr-modal-pubkey">{shortPubkey}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
