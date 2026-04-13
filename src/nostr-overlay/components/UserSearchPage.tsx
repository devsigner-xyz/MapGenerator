import { useEffect, useMemo, useState } from 'react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { type SearchUsersResult, useUserSearchQuery } from '../query/user-search.query';

interface UserSearchPageProps {
    onClose: () => void;
    onSearch: (query: string) => Promise<SearchUsersResult>;
    onSelectUser: (pubkey: string) => void;
    onMessageUser?: (pubkey: string) => void | Promise<void>;
}

const SEARCH_DEBOUNCE_MS = 300;

function profileDisplayName(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName || profile?.name || `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

function profileShortNpub(pubkey: string): string {
    try {
        const npub = encodeHexToNpub(pubkey);
        return `${npub.slice(0, 14)}...${npub.slice(-6)}`;
    } catch {
        return `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
    }
}

export function UserSearchPage({
    onClose,
    onSearch,
    onSelectUser,
    onMessageUser,
}: UserSearchPageProps) {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedQuery(query);
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [query]);

    const searchQuery = useUserSearchQuery({
        term: debouncedQuery,
        enabled: true,
        onSearch,
    });

    const rows = useMemo(
        () => searchQuery.result.pubkeys.map((pubkey) => ({ pubkey, profile: searchQuery.result.profiles[pubkey] })),
        [searchQuery.result]
    );

    const resultsContent = !query.trim() ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>Buscar usuarios globalmente</EmptyTitle>
                <EmptyDescription>Escribe para buscar por nombre, npub o pubkey.</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : searchQuery.isLoading ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <Spinner />
                </EmptyMedia>
                <EmptyTitle>Buscando usuarios</EmptyTitle>
                <EmptyDescription>Estamos consultando perfiles en los relays.</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : searchQuery.error ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>Error de busqueda</EmptyTitle>
                <EmptyDescription>{searchQuery.error}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : rows.length === 0 ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>Sin resultados</EmptyTitle>
                <EmptyDescription>No se encontraron usuarios.</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : (
        rows.map(({ pubkey, profile }) => {
            const display = profileDisplayName(pubkey, profile);
            return (
                <CommandItem
                    key={pubkey}
                    value={`${display} ${profileShortNpub(pubkey)} ${pubkey}`}
                    className="nostr-global-search-result-row"
                    onSelect={() => {
                        onSelectUser(pubkey);
                        onClose();
                    }}
                >
                    <div className="nostr-global-search-result-main">
                        <Avatar className="size-8">
                            {profile?.picture ? <AvatarImage src={profile.picture} alt={display} /> : null}
                            <AvatarFallback>{display.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="nostr-global-search-result-copy">
                            <p className="nostr-global-search-result-name">{display}</p>
                            <p className="nostr-global-search-result-id">{profileShortNpub(pubkey)}</p>
                        </div>
                    </div>

                    {onMessageUser ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onPointerDown={(event: { stopPropagation: () => void }) => {
                                event.stopPropagation();
                            }}
                            onClick={(event: { stopPropagation: () => void }) => {
                                event.stopPropagation();
                                void onMessageUser(pubkey);
                                onClose();
                            }}
                        >
                            Mensaje
                        </Button>
                    ) : null}
                </CommandItem>
            );
        })
    );

    return (
        <section className="nostr-routed-surface" aria-label="Buscar usuarios globalmente">
            <div className="nostr-routed-surface-content">
                <div className="nostr-global-search-page nostr-routed-surface-panel nostr-page-layout">
                    <header className="nostr-page-header">
                        <h3 className="nostr-page-header-inline-title">Buscar usuarios globalmente</h3>
                        <p>Filtra perfiles Nostr por nombre, npub o pubkey.</p>
                    </header>

                    <section className="nostr-page-content">
                        <Command shouldFilter={false} className="nostr-global-search-command">
                            <CommandInput
                                value={query}
                                aria-label="Buscar usuarios globalmente"
                                placeholder="Buscar por nombre, npub o pubkey"
                                onValueChange={setQuery}
                            />
                            <CommandList className="nostr-global-search-results">
                                {resultsContent}
                            </CommandList>
                        </Command>
                    </section>
                </div>
            </div>
        </section>
    );
}
