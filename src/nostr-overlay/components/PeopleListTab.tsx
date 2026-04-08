import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { NostrProfile } from '../../nostr/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

    const renderPersonButton = (pubkey: string) => {
        const profile = profiles[pubkey];
        const active = selectedPubkey === pubkey;

        return (
            <Button
                type="button"
                variant="ghost"
                className={`nostr-person${active ? ' nostr-person-active' : ''}`}
                onClick={() => onSelectPerson?.(pubkey)}
            >
                <span className="nostr-person-name">{personName(pubkey, profile)}</span>
                <span className="nostr-person-key">{`${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`}</span>
            </Button>
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
                                {renderPersonButton(pubkey)}
                            </div>
                        );
                    })}
                </div>
            </div>
        ) : (
            <ScrollArea className="nostr-people-scroll-area">
                <ul className="nostr-people-list">
                    {people.map((pubkey) => {
                        return (
                            <li key={pubkey}>
                                {renderPersonButton(pubkey)}
                            </li>
                        );
                    })}
                </ul>
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
