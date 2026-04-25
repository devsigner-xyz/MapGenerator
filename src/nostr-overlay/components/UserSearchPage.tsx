import { useEffect, useMemo, useState } from 'react';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useI18n } from '@/i18n/useI18n';
import { Spinner } from '@/components/ui/spinner';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlaySurface } from './OverlaySurface';
import { VerifiedUserAvatar } from './VerifiedUserAvatar';
import { type SearchUsersResult, useUserSearchQuery } from '../query/user-search.query';

interface UserSearchPageProps {
    onClose: () => void;
    onSearch: (query: string) => Promise<SearchUsersResult>;
    searchRelaySetKey?: string | undefined;
    onSelectUser: (pubkey: string) => void;
    ownerPubkey?: string | undefined;
    followedPubkeys?: string[];
    verificationByPubkey?: Record<string, Nip05ValidationResult | undefined>;
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
    searchRelaySetKey,
    onSelectUser,
    ownerPubkey,
    followedPubkeys = [],
    verificationByPubkey = {},
    onFollowUser,
    onMessageUser,
}: UserSearchPageProps) {
    const { t } = useI18n();
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
        ownerPubkey,
        searchRelaySetKey,
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
                <EmptyTitle>{t('userSearch.emptyInitialTitle')}</EmptyTitle>
                <EmptyDescription>{t('userSearch.emptyInitialDescription')}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : searchQuery.isLoading ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <Spinner />
                </EmptyMedia>
                <EmptyTitle>{t('userSearch.loadingTitle')}</EmptyTitle>
                <EmptyDescription>{t('userSearch.loadingDescription')}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : searchQuery.error ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>{t('userSearch.errorTitle')}</EmptyTitle>
                <EmptyDescription>{searchQuery.error}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : rows.length === 0 ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>{t('userSearch.emptyResultsTitle')}</EmptyTitle>
                <EmptyDescription>{t('userSearch.emptyResultsDescription')}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : (
        rows.map(({ pubkey, profile }) => {
            const display = profileDisplayName(pubkey, profile);
            const verification = verificationByPubkey[pubkey];
            const canFollow = typeof onFollowUser === 'function' && ownerPubkey !== pubkey;
            const isFollowPending = Object.prototype.hasOwnProperty.call(pendingFollowByPubkey, pubkey);
            const isFollowed = isFollowPending ? true : followedSet.has(pubkey);
            const followLabel = isFollowed ? t('userSearch.following') : t('userSearch.follow');
            const followAriaLabel = isFollowPending
                ? t('userSearch.followUpdating', { displayName: display })
                : isFollowed
                    ? t('userSearch.unfollow', { displayName: display })
                    : t('userSearch.followUser', { displayName: display });
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
                            <VerifiedUserAvatar
                                picture={profile?.picture}
                                imageAlt={display}
                                fallback={display.slice(0, 2).toUpperCase()}
                                nip05={profile?.nip05}
                                verification={verification}
                            />
                            <ItemContent>
                                <ItemTitle className="nostr-identity-row">
                                    <span className="truncate">{display}</span>
                                </ItemTitle>
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
                                        {t('userSearch.message')}
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
        <OverlaySurface ariaLabel={t('userSearch.title')}>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="nostr-global-search-page nostr-routed-surface-panel nostr-page-layout">
                    <OverlayPageHeader
                        title={t('userSearch.title')}
                        description={t('userSearch.description')}
                    />

                    <section className="grid gap-2.5">
                        <Command shouldFilter={false} className="nostr-global-search-command">
                            <CommandInput
                                value={query}
                                aria-label={t('userSearch.inputAria')}
                                placeholder={t('userSearch.inputPlaceholder')}
                                onValueChange={setQuery}
                            />
                            <CommandList className="nostr-global-search-results">
                                {resultsContent}
                            </CommandList>
                        </Command>
                    </section>
                </div>
            </div>
        </OverlaySurface>
    );
}
