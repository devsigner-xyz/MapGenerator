import { useMemo, useState } from 'react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { AuthSessionState, LoginMethod } from '../../nostr/auth/session';
import type { NostrProfile } from '../../nostr/types';
import { LoginMethodSelector } from './LoginMethodSelector';
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
    onViewPersonDetails?: (pubkey: string) => void;
    zapAmounts?: number[];
    onConfigureZapAmounts?: () => void;
    onCopyOwnerNpub?: (value: string) => void | Promise<void>;
    loginDisabled?: boolean;
    authSession?: AuthSessionState;
    onStartSession?: (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;
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
    onViewPersonDetails,
    zapAmounts = [21, 128, 256],
    onConfigureZapAmounts,
    onCopyOwnerNpub,
    loginDisabled = false,
    authSession,
    onStartSession,
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
        let npub = '';
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
        <div className={`nostr-social-sidebar ${!authSession ? 'nostr-social-sidebar-authless' : ''}`} aria-label="Panel social">
            {!authSession ? (
                <LoginMethodSelector
                    disabled={loginDisabled}
                    onStartSession={async (method, input) => {
                        await onStartSession?.(method, input);
                    }}
                />
            ) : null}

            {authSession ? (
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
                            ownerPubkey={ownerPubkey}
                            ownerProfile={ownerProfile}
                            ownerVerification={ownerPubkey ? verificationByPubkey[ownerPubkey] : undefined}
                        />
                    </TabsContent>

                    <TabsContent value="following" className="nostr-tab-panel">
                        <PeopleListTab
                            people={filteredFollowingPeople}
                            profiles={profiles}
                            emptyText={followingSearch ? 'No hay resultados para esta busqueda.' : 'No hay cuentas seguidas todavía.'}
                            loading={false}
                            selectedPubkey={selectedFollowingPubkey}
                            onSelectPerson={onSelectFollowing}
                            onLocatePerson={onLocateFollowing}
                            onCopyNpub={onCopyOwnerNpub}
                            onSendMessage={onMessagePerson}
                            onViewDetails={onViewPersonDetails}
                            zapAmounts={zapAmounts}
                            onConfigureZapAmounts={onConfigureZapAmounts}
                            searchQuery={followingPeople.length > 0 ? followingSearch : undefined}
                            onSearchQueryChange={followingPeople.length > 0 ? setFollowingSearch : undefined}
                            searchAriaLabel={followingPeople.length > 0 ? 'Buscar en seguidos' : undefined}
                            verificationByPubkey={verificationByPubkey}
                        />
                    </TabsContent>

                    <TabsContent value="followers" className="nostr-tab-panel">
                        <PeopleListTab
                            people={filteredFollowerPeople}
                            profiles={followerProfiles}
                            emptyText={followersSearch ? 'No hay resultados para esta busqueda.' : 'No se encontraron seguidores aún.'}
                            loading={followersLoading}
                            onCopyNpub={onCopyOwnerNpub}
                            onSendMessage={onMessagePerson}
                            onViewDetails={onViewPersonDetails}
                            zapAmounts={zapAmounts}
                            onConfigureZapAmounts={onConfigureZapAmounts}
                            searchQuery={followerPeople.length > 0 ? followersSearch : undefined}
                            onSearchQueryChange={followerPeople.length > 0 ? setFollowersSearch : undefined}
                            searchAriaLabel={followerPeople.length > 0 ? 'Buscar en seguidores' : undefined}
                            verificationByPubkey={verificationByPubkey}
                        />
                    </TabsContent>
                </Tabs>
            ) : null}
        </div>
    );
}
