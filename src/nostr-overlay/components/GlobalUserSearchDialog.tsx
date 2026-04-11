import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, SearchIcon, XIcon } from 'lucide-react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from '@/components/ui/input-group';

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
}: GlobalUserSearchDialogProps) {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SearchUsersResult>({
        pubkeys: [],
        profiles: {},
    });
    const requestIdRef = useRef(0);

    useEffect(() => {
        if (!open) {
            setQuery('');
            setIsSearching(false);
            setError(null);
            setResult({ pubkeys: [], profiles: {} });
            requestIdRef.current += 1;
        }
    }, [open]);

    useEffect(() => {
        if (!open) {
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
    }, [open, query, onSearch]);

    const rows = useMemo(
        () => result.pubkeys.map((pubkey) => ({ pubkey, profile: result.profiles[pubkey] })),
        [result]
    );

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onClose();
                }
            }}
        >
            <DialogContent className="nostr-dialog nostr-global-search-dialog" showCloseButton={false} aria-label="Buscar usuarios globalmente">
                <DialogTitle className="sr-only">Buscar usuarios globalmente</DialogTitle>
                <DialogDescription className="sr-only">Busqueda global de perfiles Nostr por nombre, npub o pubkey.</DialogDescription>

                <div className="nostr-global-search-header">
                    <p className="nostr-global-search-title">Buscar usuarios globalmente</p>
                    <button type="button" className="nostr-dialog-close" onClick={onClose} aria-label="Cerrar buscador global">
                        ×
                    </button>
                </div>

                <div className="nostr-search-row">
                    <InputGroup>
                        <InputGroupAddon align="inline-start" aria-hidden="true">
                            <SearchIcon />
                        </InputGroupAddon>

                        <InputGroupInput
                            value={query}
                            aria-label="Buscar usuarios globalmente"
                            placeholder="Buscar por nombre, npub o pubkey"
                            onChange={(event) => setQuery(event.target.value)}
                        />

                        <InputGroupAddon align="inline-end">
                            {isSearching ? (
                                <InputGroupText aria-label="Buscando usuarios" role="status">
                                    <Loader2 className="animate-spin" />
                                </InputGroupText>
                            ) : null}

                            <InputGroupButton
                                size="icon-xs"
                                aria-label="Limpiar busqueda global"
                                disabled={query.trim().length === 0}
                                onClick={() => setQuery('')}
                            >
                                <XIcon />
                            </InputGroupButton>
                        </InputGroupAddon>
                    </InputGroup>
                </div>

                {!query.trim() ? (
                    <p className="nostr-global-search-empty">Escribe para buscar por nombre, npub o pubkey.</p>
                ) : isSearching ? (
                    <p className="nostr-global-search-empty">Buscando usuarios...</p>
                ) : error ? (
                    <p className="nostr-global-search-empty">{error}</p>
                ) : rows.length === 0 ? (
                    <p className="nostr-global-search-empty">No se encontraron usuarios.</p>
                ) : (
                    <ul className="nostr-global-search-results">
                        {rows.map(({ pubkey, profile }) => {
                            const display = profileDisplayName(pubkey, profile);
                            return (
                                <li key={pubkey} className="nostr-global-search-result-row">
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

                                    <div className="nostr-global-search-result-actions">
                                        {onMessageUser ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    void onMessageUser(pubkey);
                                                    onClose();
                                                }}
                                            >
                                                Mensaje
                                            </Button>
                                        ) : null}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                onSelectUser(pubkey);
                                                onClose();
                                            }}
                                        >
                                            Ver detalles
                                        </Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
