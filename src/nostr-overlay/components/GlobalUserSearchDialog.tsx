import { useEffect, useMemo, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandDialog,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { DialogClose } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

interface SearchUsersResult {
    pubkeys: string[];
    profiles: Record<string, NostrProfile>;
}

interface GlobalUserSearchDialogProps {
    open: boolean;
    onClose: () => void;
    onSearch: (query: string) => Promise<SearchUsersResult>;
    onSelectUser: (pubkey: string) => void;
    onMessageUser?: (pubkey: string) => void | Promise<void>;
    variant?: 'dialog' | 'surface';
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

export function GlobalUserSearchDialog({
    open,
    onClose,
    onSearch,
    onSelectUser,
    onMessageUser,
    variant = 'dialog',
}: GlobalUserSearchDialogProps) {
    const isOpen = variant === 'surface' ? true : open;
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SearchUsersResult>({
        pubkeys: [],
        profiles: {},
    });
    const requestIdRef = useRef(0);

    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setIsSearching(false);
            setError(null);
            setResult({ pubkeys: [], profiles: {} });
            requestIdRef.current += 1;
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            requestIdRef.current += 1;
            setIsSearching(false);
            setError(null);
            setResult({ pubkeys: [], profiles: {} });
            return;
        }

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        const timer = window.setTimeout(() => {
            setIsSearching(true);
            setError(null);
            void onSearch(normalizedQuery)
                .then((nextResult) => {
                    if (requestIdRef.current !== requestId) {
                        return;
                    }

                    setResult(nextResult);
                    setIsSearching(false);
                })
                .catch(() => {
                    if (requestIdRef.current !== requestId) {
                        return;
                    }

                    setError('No se pudo buscar usuarios.');
                    setResult({ pubkeys: [], profiles: {} });
                    setIsSearching(false);
                });
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [isOpen, query, onSearch]);

    const rows = useMemo(
        () => result.pubkeys.map((pubkey) => ({ pubkey, profile: result.profiles[pubkey] })),
        [result]
    );

    const resultsContent = !query.trim() ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>Buscar usuarios globalmente</EmptyTitle>
                <EmptyDescription>Escribe para buscar por nombre, npub o pubkey.</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : isSearching ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <Spinner />
                </EmptyMedia>
                <EmptyTitle>Buscando usuarios</EmptyTitle>
                <EmptyDescription>Estamos consultando perfiles en los relays.</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : error ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>Error de busqueda</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
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

    if (variant === 'surface') {
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

    return (
        <CommandDialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onClose();
                }
            }}
            title="Buscar usuarios globalmente"
            description="Busqueda global de perfiles Nostr por nombre, npub o pubkey."
            className="sm:max-w-2xl"
            showCloseButton={false}
        >
            <Command shouldFilter={false}>
                <header className="nostr-page-header nostr-global-search-page-header px-3 pt-3">
                    <div>
                        <h3 className="nostr-page-header-inline-title">Buscar usuarios globalmente</h3>
                        <p>Filtra perfiles Nostr por nombre, npub o pubkey.</p>
                    </div>
                    <DialogClose asChild>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar buscador global">
                            <XIcon data-icon="inline-start" />
                        </Button>
                    </DialogClose>
                </header>

                <section className="nostr-page-content">
                    <CommandInput
                        value={query}
                        aria-label="Buscar usuarios globalmente"
                        placeholder="Buscar por nombre, npub o pubkey"
                        onValueChange={setQuery}
                    />
                    <CommandList className="nostr-global-search-results">
                        {resultsContent}
                    </CommandList>
                </section>
            </Command>
        </CommandDialog>
    );
}
