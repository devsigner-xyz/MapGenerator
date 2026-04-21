import { useEffect, useMemo, useState } from 'react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { OverlayPageHeader } from './OverlayPageHeader';
import { type SearchUsersResult, useUserSearchQuery } from '../query/user-search.query';

interface UserSearchPageProps {
    onClose: () => void;
    onSearch: (query: string) => Promise<SearchUsersResult>;
    onSelectUser: (pubkey: string) => void;
    ownerPubkey?: string;
    followedPubkeys?: string[];
    onFollowUser?: (pubkey: string) => void | Promise<void>;
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
    ownerPubkey,
    followedPubkeys = [],
    onFollowUser,
    onMessageUser,
}: UserSearchPageProps) {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [pendingFollowByPubkey, setPendingFollowByPubkey] = useState<Record<string, boolean>>({});
    const followedSet = useMemo(() => new Set(followedPubkeys), [followedPubkeys]);

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

    const followUser = (pubkey: string): void => {
        if (typeof onFollowUser !== 'function') {
            return;
        }

        setPendingFollowByPubkey((current) => ({
            ...current,
            [pubkey]: true,
        }));

        void Promise.resolve(onFollowUser(pubkey))
            .catch((): void => undefined)
            .finally((): void => {
                setPendingFollowByPubkey((current) => {
                    if (!current[pubkey]) {
                        return current;
                    }

                    const next = { ...current };
                    delete next[pubkey];
                    return next;
                });
            });
    };

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
            const canFollow = typeof onFollowUser === 'function' && ownerPubkey !== pubkey;
            const isFollowPending = Object.prototype.hasOwnProperty.call(pendingFollowByPubkey, pubkey);
            const isFollowed = isFollowPending ? true : followedSet.has(pubkey);
            const followLabel = isFollowed ? 'Following' : 'Follow';
            const followAriaLabel = isFollowPending
                ? `Updating follow state for ${display}`
                : isFollowed
                    ? `Unfollow ${display}`
                    : `Follow ${display}`;
            return (
                <CommandItem
                    key={pubkey}
                    value={`${display} ${profileShortNpub(pubkey)} ${pubkey}`}
                    className="nostr-global-search-result-row p-0"
                    onSelect={() => {
                        onSelectUser(pubkey);
                        onClose();
                    }}
                >
                    <Item
                        variant="outline"
                        size="sm"
                        className="w-full justify-between border-transparent bg-transparent group-data-selected/command-item:bg-muted/80"
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <Avatar className="size-8">
                                {profile?.picture ? <AvatarImage src={profile.picture} alt={display} /> : null}
                                <AvatarFallback>{display.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <ItemContent>
                                <ItemTitle className="truncate">{display}</ItemTitle>
                                <ItemDescription className="truncate">{profileShortNpub(pubkey)}</ItemDescription>
                            </ItemContent>
                        </div>

                        {(onMessageUser || canFollow) ? (
                            <ItemActions>
                                {canFollow ? (
                                    <Button
                                        type="button"
                                        variant={isFollowed ? 'secondary' : 'outline'}
                                        size="sm"
                                        disabled={isFollowPending}
                                        aria-label={followAriaLabel}
                                        onPointerDown={(event: { stopPropagation: () => void }) => {
                                            event.stopPropagation();
                                        }}
                                        onClick={(event: { stopPropagation: () => void }) => {
                                            event.stopPropagation();
                                            followUser(pubkey);
                                        }}
                                    >
                                        {followLabel}
                                    </Button>
                                ) : null}

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
                            </ItemActions>
                        ) : null}
                    </Item>
                </CommandItem>
            );
        })
    );

    return (
        <section className="nostr-routed-surface" aria-label="Buscar usuarios globalmente">
            <div className="nostr-routed-surface-content">
                <div className="nostr-global-search-page nostr-routed-surface-panel nostr-page-layout">
                    <OverlayPageHeader
                        title="Buscar usuarios globalmente"
                        description="Filtra perfiles Nostr por nombre, npub o pubkey."
                    />

                    <section className="grid gap-2.5">
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
