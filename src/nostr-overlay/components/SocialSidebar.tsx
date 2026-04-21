import { useMemo, useState } from 'react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { PeopleListTab } from './PeopleListTab';
import { ProfileTab } from './ProfileTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SocialTab = 'profile' | 'following' | 'followers';

interface SocialSidebarProps {
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
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
    ownerPubkey,
    ownerProfile,
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
    const [activeTab, setActiveTab] = useState<SocialTab>('profile');
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
    const ownerVerification = ownerPubkey ? verificationByPubkey[ownerPubkey] : undefined;

    return (
        <div className="nostr-social-sidebar" aria-label="Panel social">
            <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as SocialTab)}
                className="nostr-social-tabs"
                aria-label="Pestanas sociales"
            >
                <TabsList variant="line" className="grid h-auto w-full grid-cols-3" aria-label="Pestanas sociales">
                    <TabsTrigger value="profile">Sobre mi</TabsTrigger>
                    <TabsTrigger value="following">{`Sigues (${followingPeople.length})`}</TabsTrigger>
                    <TabsTrigger value="followers">{`Seguidores (${followerPeople.length})`}</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="nostr-tab-panel">
                    <ProfileTab
                        {...(ownerPubkey ? { ownerPubkey } : {})}
                        {...(ownerProfile ? { ownerProfile } : {})}
                        {...(ownerVerification ? { ownerVerification } : {})}
                    />
                </TabsContent>

                <TabsContent value="following" className="nostr-tab-panel">
                    <PeopleListTab
                        people={filteredFollowingPeople}
                        profiles={profiles}
                        emptyText={followingSearch ? 'No hay resultados para esta busqueda.' : 'No hay cuentas seguidas todavía.'}
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
                        {...(followingPeople.length > 0 ? { searchAriaLabel: 'Buscar en seguidos' } : {})}
                        followedPubkeys={followingPeople}
                        {...(onFollowPerson ? { onFollowPerson } : {})}
                        verificationByPubkey={verificationByPubkey}
                    />
                </TabsContent>

                <TabsContent value="followers" className="nostr-tab-panel">
                    <PeopleListTab
                        people={filteredFollowerPeople}
                        profiles={followerProfiles}
                        emptyText={followersSearch ? 'No hay resultados para esta busqueda.' : 'No se encontraron seguidores aún.'}
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
                        {...(followerPeople.length > 0 ? { searchAriaLabel: 'Buscar en seguidores' } : {})}
                        verificationByPubkey={verificationByPubkey}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
