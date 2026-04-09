import type { Nip05ValidationResult } from '../../nostr/nip05';
import { getNip05DisplayIdentifier } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';

interface Nip05IdentifierProps {
    profile?: NostrProfile;
    verification?: Nip05ValidationResult;
    className?: string;
}

export function Nip05Identifier({ profile, verification, className }: Nip05IdentifierProps) {
    const display = getNip05DisplayIdentifier(profile?.nip05);
    if (!display) {
        return null;
    }

    const verified = verification?.status === 'verified';

    return (
        <span
            className={`nostr-nip05-chip${verified ? ' is-verified' : ''}${className ? ` ${className}` : ''}`}
            title={profile?.nip05}
            aria-label={verified ? `NIP-05 verificado: ${display}` : `NIP-05: ${display}`}
        >
            <span className="nostr-nip05-text">{display}</span>
            {verified ? (
                <span className="nostr-nip05-check" aria-hidden="true">✓</span>
            ) : null}
        </span>
    );
}
