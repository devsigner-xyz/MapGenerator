import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ScrollArea } from '@/components/ui/scroll-area';

const VIRTUALIZATION_THRESHOLD = 120;
const VIRTUAL_ROW_HEIGHT_PX = 62;

interface PeopleListTabProps {
    people: string[];
    profiles: Record<string, NostrProfile>;
    emptyText: string;
    loadingText?: string;
    loading: boolean;
    selectedPubkey?: string;
    onSelectPerson?: (pubkey: string) => void;
    onLocatePerson?: (pubkey: string) => void;
    onCopyNpub?: (value: string) => void | Promise<void>;
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

function personInitials(pubkey: string, profile: NostrProfile | undefined): string {
    const name = personName(pubkey, profile).trim();
    if (!name) {
        return pubkey.slice(0, 2).toUpperCase();
    }

    const parts = name.split(/\s+/).filter((part) => part.length > 0);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function pubkeyToNpub(pubkey: string): string {
    try {
        return encodeHexToNpub(pubkey);
    } catch {
        return pubkey;
    }
}

export function PeopleListTab({
    people,
    profiles,
    emptyText,
    loadingText,
    loading,
    selectedPubkey,
    onSelectPerson,
    onLocatePerson,
    onCopyNpub,
    searchQuery,
    onSearchQueryChange,
    searchAriaLabel,
}: PeopleListTabProps) {
    const hasSearch = typeof onSearchQueryChange === 'function';
    const shouldVirtualize = people.length >= VIRTUALIZATION_THRESHOLD;
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    const rowVirtualizer = useVirtualizer({
        count: people.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => VIRTUAL_ROW_HEIGHT_PX,
        overscan: 8,
        initialRect: {
            width: 320,
            height: 420,
        },
    });
    const virtualItems = rowVirtualizer.getVirtualItems();
    const renderedVirtualItems = virtualItems.length > 0
        ? virtualItems.map((item) => ({
            key: `item-${item.key}`,
            index: item.index,
            start: item.start,
            measurable: true,
        }))
        : Array.from({ length: Math.min(24, people.length) }, (_, index) => ({
            key: `fallback-${index}`,
            index,
            start: index * VIRTUAL_ROW_HEIGHT_PX,
            measurable: false,
        }));
    const totalVirtualHeight = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize()
        : people.length * VIRTUAL_ROW_HEIGHT_PX;

    const renderPersonItem = (pubkey: string, key?: string) => {
        const profile = profiles[pubkey];
        const active = selectedPubkey === pubkey;
        const selectable = typeof onSelectPerson === 'function';
        const canLocate = typeof onLocatePerson === 'function';
        const canCopy = typeof onCopyNpub === 'function';
        const shortKey = `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
        const display = personName(pubkey, profile);

        return (
            <Item
                key={key || pubkey}
                variant={active ? 'outline' : 'default'}
                size="sm"
                data-active={active ? 'true' : 'false'}
                className={selectable ? 'cursor-pointer gap-2' : undefined}
            >
                {selectable ? (
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left outline-none"
                        aria-pressed={active}
                        onClick={() => onSelectPerson?.(pubkey)}
                    >
                        <ItemMedia>
                            <Avatar className="size-8">
                                {profile?.picture ? (
                                    <AvatarImage src={profile.picture} alt={display} />
                                ) : null}
                                <AvatarFallback>{personInitials(pubkey, profile)}</AvatarFallback>
                            </Avatar>
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                            <ItemTitle className="w-full truncate">{display}</ItemTitle>
                            <ItemDescription className="truncate">{shortKey}</ItemDescription>
                        </ItemContent>
                    </button>
                ) : (
                    <>
                        <ItemMedia>
                            <Avatar className="size-8">
                                {profile?.picture ? (
                                    <AvatarImage src={profile.picture} alt={display} />
                                ) : null}
                                <AvatarFallback>{personInitials(pubkey, profile)}</AvatarFallback>
                            </Avatar>
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                            <ItemTitle className="w-full truncate">{display}</ItemTitle>
                            <ItemDescription className="truncate">{shortKey}</ItemDescription>
                        </ItemContent>
                    </>
                )}

                {canLocate || canCopy ? (
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                        {canLocate ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="cursor-pointer"
                                aria-label={`Ubicar ${display} en el mapa`}
                                title="Locate on map"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onLocatePerson?.(pubkey);
                                }}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <circle cx="12" cy="11" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                                </svg>
                            </Button>
                        ) : null}

                        {canCopy ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="cursor-pointer"
                                aria-label={`Copiar npub de ${display}`}
                                title="Copy npub"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void onCopyNpub?.(pubkeyToNpub(pubkey));
                                }}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <rect x="9" y="9" width="11" height="11" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
                                    <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </Item>
        );
    };

    const listContent = people.length === 0
        ? <p className="nostr-empty">{loading && loadingText ? loadingText : emptyText}</p>
        : shouldVirtualize ? (
            <div ref={scrollContainerRef} className="nostr-people-scroll-area nostr-people-scroll-virtual" data-virtualized="true">
                <div
                    className="nostr-people-virtual-inner"
                    style={{
                        height: `${totalVirtualHeight}px`,
                    }}
                >
                    {renderedVirtualItems.map((virtualItem) => {
                        const pubkey = people[virtualItem.index];
                        if (!pubkey) {
                            return null;
                        }

                        return (
                            <div
                                key={virtualItem.key}
                                ref={virtualItem.measurable ? rowVirtualizer.measureElement : undefined}
                                data-index={virtualItem.index}
                                className="nostr-people-virtual-row"
                                style={{
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            >
                                {renderPersonItem(pubkey)}
                            </div>
                        );
                    })}
                </div>
            </div>
        ) : (
            <ScrollArea className="nostr-people-scroll-area">
                <ItemGroup className="nostr-people-list">
                    {people.map((pubkey) => {
                        return renderPersonItem(pubkey, pubkey);
                    })}
                </ItemGroup>
            </ScrollArea>
        );

    if (!hasSearch) {
        return listContent;
    }

    return (
        <div className="nostr-people-tab-content">
            <div className="nostr-search-row">
                <Input
                    className="nostr-input nostr-search-input"
                    type="text"
                    value={searchQuery || ''}
                    placeholder="Buscar por nombre o npub"
                    aria-label={searchAriaLabel || 'Buscar'}
                    onChange={(event) => onSearchQueryChange?.(event.target.value)}
                />

                {searchQuery ? (
                    <Button
                        type="button"
                        variant="ghost"
                        className="nostr-search-clear"
                        aria-label="Limpiar busqueda"
                        onClick={() => onSearchQueryChange?.('')}
                    >
                        x
                    </Button>
                ) : null}
            </div>

            {listContent}
        </div>
    );
}
