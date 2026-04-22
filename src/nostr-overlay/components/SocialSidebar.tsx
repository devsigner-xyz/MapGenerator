import { useMemo, useState } from 'react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { useI18n } from '@/i18n/useI18n';
import { PeopleListTab } from './PeopleListTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SocialTab = 'following' | 'followers';

interface SocialSidebarProps {
    follows?: string[];
    profiles?: Record<string, NostrProfile>;
    followers?: string[];
    followerProfiles?: Record<string, NostrProfile>;
    followersLoading?: boolean;
    selectedFollowingPubkey?: string;
    onSelectFollowing?: (pubkey: string) => void;
    onLocateFollowing?: (pubkey: string) => void;
    onMessagePerson?: (pubkey: string) => void | Promise<void>;
    onFollowPerson?: (pubkey: string) => void | Promise<void>;
    onViewPersonDetails?: (pubkey: string) => void;
    zapAmounts?: number[];
    onZapPerson?: (pubkey: string, amount: number) => void | Promise<void>;
    onConfigureZapAmounts?: () => void;
    onCopyOwnerNpub?: (value: string) => void | Promise<void>;
    verificationByPubkey?: Record<string, Nip05ValidationResult | undefined>;
}

export function SocialSidebar({
    follows = [],
    profiles = {},
    followers = [],
    followerProfiles = {},
    followersLoading = false,
    selectedFollowingPubkey,
    onSelectFollowing,
    onLocateFollowing,
    onMessagePerson,
    onFollowPerson,
    onViewPersonDetails,
    zapAmounts = [21, 128, 256],
    onZapPerson,
    onConfigureZapAmounts,
    onCopyOwnerNpub,
    verificationByPubkey = {},
}: SocialSidebarProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<SocialTab>('following');
    const [followingSearch, setFollowingSearch] = useState('');
    const [followersSearch, setFollowersSearch] = useState('');

    const followingPeople = useMemo(() => [...new Set(follows)], [follows]);
    const followerPeople = useMemo(() => [...new Set(followers)], [followers]);

    const matchesSearch = (pubkey: string, profile: NostrProfile | undefined, query: string): boolean => {
        const displayName = profile?.displayName || '';
        const name = profile?.name || '';
        let npub: string;
        try {
            npub = encodeHexToNpub(pubkey);
        } catch {
            npub = '';
        }

        return pubkey.toLowerCase().includes(query)
            || npub.toLowerCase().includes(query)
            || displayName.toLowerCase().includes(query)
            || name.toLowerCase().includes(query);
    };

    const filteredFollowingPeople = useMemo(() => {
        const query = followingSearch.trim().toLowerCase();
        if (!query) {
            return followingPeople;
        }

        return followingPeople.filter((pubkey) => matchesSearch(pubkey, profiles[pubkey], query));
    }, [followingPeople, followingSearch, profiles]);

    const filteredFollowerPeople = useMemo(() => {
        const query = followersSearch.trim().toLowerCase();
        if (!query) {
            return followerPeople;
        }

        return followerPeople.filter((pubkey) => matchesSearch(pubkey, followerProfiles[pubkey], query));
    }, [followerPeople, followerProfiles, followersSearch]);
    return (
        <div className="nostr-social-sidebar" aria-label={t('social.panel')}>
            <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as SocialTab)}
                className="nostr-social-tabs"
                aria-label={t('social.tabs')}
            >
                <TabsList variant="line" className="grid h-auto w-full grid-cols-2" aria-label={t('social.tabs')}>
                    <TabsTrigger value="following">{t('social.following', { count: followingPeople.length })}</TabsTrigger>
                    <TabsTrigger value="followers">{t('social.followers', { count: followerPeople.length })}</TabsTrigger>
                </TabsList>

                <TabsContent value="following" className="nostr-tab-panel">
                    <PeopleListTab
                        people={filteredFollowingPeople}
                        profiles={profiles}
                        emptyText={followingSearch ? t('social.emptyFollowingSearch') : t('social.emptyFollowing')}
                        loading={false}
                        {...(selectedFollowingPubkey !== undefined ? { selectedPubkey: selectedFollowingPubkey } : {})}
                        {...(onSelectFollowing ? { onSelectPerson: onSelectFollowing } : {})}
                        {...(onLocateFollowing ? { onLocatePerson: onLocateFollowing } : {})}
                        {...(onCopyOwnerNpub ? { onCopyNpub: onCopyOwnerNpub } : {})}
                        {...(onMessagePerson ? { onSendMessage: onMessagePerson } : {})}
                        {...(onViewPersonDetails ? { onViewDetails: onViewPersonDetails } : {})}
                        zapAmounts={zapAmounts}
                        {...(onZapPerson ? { onZapPerson } : {})}
                        {...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {})}
                        {...(followingPeople.length > 0 ? { searchQuery: followingSearch } : {})}
                        {...(followingPeople.length > 0 ? { onSearchQueryChange: setFollowingSearch } : {})}
                        {...(followingPeople.length > 0 ? { searchAriaLabel: t('social.searchFollowing') } : {})}
                        followedPubkeys={followingPeople}
                        {...(onFollowPerson ? { onFollowPerson } : {})}
                        verificationByPubkey={verificationByPubkey}
                    />
                </TabsContent>

                <TabsContent value="followers" className="nostr-tab-panel">
                    <PeopleListTab
                        people={filteredFollowerPeople}
                        profiles={followerProfiles}
                        emptyText={followersSearch ? t('social.emptyFollowersSearch') : t('social.emptyFollowers')}
                        loading={followersLoading}
                        {...(selectedFollowingPubkey !== undefined ? { selectedPubkey: selectedFollowingPubkey } : {})}
                        {...(onSelectFollowing ? { onSelectPerson: onSelectFollowing } : {})}
                        {...(onLocateFollowing ? { onLocatePerson: onLocateFollowing } : {})}
                        {...(onCopyOwnerNpub ? { onCopyNpub: onCopyOwnerNpub } : {})}
                        {...(onMessagePerson ? { onSendMessage: onMessagePerson } : {})}
                        {...(onViewPersonDetails ? { onViewDetails: onViewPersonDetails } : {})}
                        zapAmounts={zapAmounts}
                        {...(onZapPerson ? { onZapPerson } : {})}
                        {...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {})}
                        followedPubkeys={followingPeople}
                        {...(onFollowPerson ? { onFollowPerson } : {})}
                        {...(followerPeople.length > 0 ? { searchQuery: followersSearch } : {})}
                        {...(followerPeople.length > 0 ? { onSearchQueryChange: setFollowersSearch } : {})}
                        {...(followerPeople.length > 0 ? { searchAriaLabel: t('social.searchFollowers') } : {})}
                        verificationByPubkey={verificationByPubkey}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
