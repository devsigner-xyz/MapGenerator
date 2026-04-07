import type { NostrProfile } from '../../nostr/types';

interface PeopleListTabProps {
    people: string[];
    profiles: Record<string, NostrProfile>;
    emptyText: string;
    loadingText?: string;
    loading: boolean;
    selectedPubkey?: string;
    onSelectPerson?: (pubkey: string) => void;
    searchQuery?: string;
    onSearchQueryChange?: (value: string) => void;
    searchAriaLabel?: string;
}

function personName(pubkey: string, profile: NostrProfile | undefined): string {
    if (profile?.displayName) {
        return profile.displayName;
    }

    if (profile?.name) {
        return profile.name;
    }

    return `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

export function PeopleListTab({
    people,
    profiles,
    emptyText,
    loadingText,
    loading,
    selectedPubkey,
    onSelectPerson,
    searchQuery,
    onSearchQueryChange,
    searchAriaLabel,
}: PeopleListTabProps) {
    const hasSearch = typeof onSearchQueryChange === 'function';

    const listContent = people.length === 0
        ? <p className="nostr-empty">{loading && loadingText ? loadingText : emptyText}</p>
        : (
            <ul className="nostr-people-list">
                {people.map((pubkey) => {
                    const profile = profiles[pubkey];
                    const active = selectedPubkey === pubkey;

                    return (
                        <li key={pubkey}>
                            <button
                                type="button"
                                className={`nostr-person${active ? ' nostr-person-active' : ''}`}
                                onClick={() => onSelectPerson?.(pubkey)}
                            >
                                <span className="nostr-person-name">{personName(pubkey, profile)}</span>
                                <span className="nostr-person-key">{`${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        );

    if (!hasSearch) {
        return listContent;
    }

    return (
        <div className="nostr-people-tab-content">
            <div className="nostr-search-row">
                <input
                    className="nostr-input nostr-search-input"
                    type="text"
                    value={searchQuery || ''}
                    placeholder="Buscar por nombre o npub"
                    aria-label={searchAriaLabel || 'Buscar'}
                    onChange={(event) => onSearchQueryChange?.(event.target.value)}
                />

                {searchQuery ? (
                    <button
                        type="button"
                        className="nostr-search-clear"
                        aria-label="Limpiar busqueda"
                        onClick={() => onSearchQueryChange?.('')}
                    >
                        x
                    </button>
                ) : null}
            </div>

            {listContent}
        </div>
    );
}
