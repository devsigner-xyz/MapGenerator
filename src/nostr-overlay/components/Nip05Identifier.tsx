import type { Nip05ValidationResult } from '../../nostr/nip05';
import { getNip05DisplayIdentifier } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';

interface Nip05IdentifierProps {
    profile?: NostrProfile;
    verification?: Nip05ValidationResult;
    className?: string;
    mode?: 'full' | 'icon';
}

function buildNip05StatusLabel(display: string, verification?: Nip05ValidationResult): string {
    if (verification?.status === 'verified') {
        return `NIP-05 verificado por DNS: ${display}`;
    }

    if (verification?.status === 'error') {
        return `NIP-05 no se pudo verificar por DNS: ${display}`;
    }

    if (verification?.status === 'unverified') {
        return `NIP-05 declarado sin verificacion DNS: ${display}`;
    }

    return `NIP-05 pendiente de verificacion DNS: ${display}`;
}

export function Nip05Identifier({ profile, verification, className, mode = 'full' }: Nip05IdentifierProps) {
    const display = getNip05DisplayIdentifier(profile?.nip05);
    if (!display) {
        return null;
    }

    const verified = verification?.status === 'verified';
    const statusLabel = buildNip05StatusLabel(display, verification);

    if (mode === 'icon') {
        return (
            <span
                className={`nostr-nip05-status-icon${verified ? ' is-verified' : ' is-unverified'}${className ? ` ${className}` : ''}`}
                title={statusLabel}
                aria-label={statusLabel}
            />
        );
    }

    return (
        <span
            className={`nostr-nip05-chip${verified ? ' is-verified' : ''}${className ? ` ${className}` : ''}`}
            title={statusLabel}
            aria-label={statusLabel}
        >
            <span className="nostr-nip05-text">{display}</span>
            {verified ? (
                <span className="nostr-nip05-check" aria-hidden="true">✓</span>
            ) : null}
        </span>
    );
}
