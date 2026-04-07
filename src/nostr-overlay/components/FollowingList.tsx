import type { NostrProfile } from '../../nostr/types';

interface FollowingListProps {
    follows: string[];
    profiles: Record<string, NostrProfile>;
    selectedPubkey?: string;
    onSelect: (pubkey: string) => void;
}

function personName(pubkey: string, profile?: NostrProfile): string {
    if (profile?.displayName) {
        return profile.displayName;
    }

    if (profile?.name) {
        return profile.name;
    }

    return `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

export function FollowingList({ follows, profiles, selectedPubkey, onSelect }: FollowingListProps) {
    if (follows.length === 0) {
        return <p className="nostr-empty">No hay cuentas seguidas todavía.</p>;
    }

    return (
        <ul className="nostr-people-list">
            {follows.map((pubkey) => {
                const profile = profiles[pubkey];
                const active = selectedPubkey === pubkey;
                return (
                    <li key={pubkey}>
                        <button
                            type="button"
                            className={`nostr-person${active ? ' nostr-person-active' : ''}`}
                            onClick={() => onSelect(pubkey)}
                        >
                            <span className="nostr-person-name">{personName(pubkey, profile)}</span>
                            <span className="nostr-person-key">{`${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
