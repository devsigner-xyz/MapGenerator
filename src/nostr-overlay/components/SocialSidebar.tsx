import { useMemo, useState } from 'react';
import type { NostrProfile } from '../../nostr/types';
import { PeopleListTab } from './PeopleListTab';
import { ProfileTab } from './ProfileTab';
import { Button } from '@/components/ui/button';

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
    onLocateOwner?: () => void;
    onCopyOwnerNpub?: (value: string) => void | Promise<void>;
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
    onLocateOwner,
    onCopyOwnerNpub,
}: SocialSidebarProps) {
    const [activeTab, setActiveTab] = useState<SocialTab>('profile');
    const [followingSearch, setFollowingSearch] = useState('');

    const followingPeople = useMemo(() => [...new Set(follows)], [follows]);
    const followerPeople = useMemo(() => [...new Set(followers)], [followers]);
    const filteredFollowingPeople = useMemo(() => {
        const query = followingSearch.trim().toLowerCase();
        if (!query) {
            return followingPeople;
        }

        return followingPeople.filter((pubkey) => {
            const profile = profiles[pubkey];
            const displayName = profile?.displayName || '';
            const name = profile?.name || '';
            return pubkey.toLowerCase().includes(query)
                || displayName.toLowerCase().includes(query)
                || name.toLowerCase().includes(query);
        });
    }, [followingPeople, profiles, followingSearch]);

    return (
        <div className="nostr-social-sidebar" aria-label="Panel social">
            <div className="nostr-tabs" role="tablist" aria-label="Pestañas sociales">
                <Button
                    type="button"
                    variant="outline"
                    className={`nostr-tab${activeTab === 'profile' ? ' nostr-tab-active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'profile'}
                    onClick={() => setActiveTab('profile')}
                >
                    Información
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    className={`nostr-tab${activeTab === 'following' ? ' nostr-tab-active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'following'}
                    onClick={() => setActiveTab('following')}
                >
                    {`Sigues (${followingPeople.length})`}
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    className={`nostr-tab${activeTab === 'followers' ? ' nostr-tab-active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'followers'}
                    onClick={() => setActiveTab('followers')}
                >
                    {`Seguidores (${followerPeople.length})`}
                </Button>
            </div>

            <div className="nostr-tab-panel" role="tabpanel">
                {activeTab === 'profile' ? (
                    <ProfileTab
                        ownerPubkey={ownerPubkey}
                        ownerProfile={ownerProfile}
                        followsCount={followingPeople.length}
                        followersCount={followerPeople.length}
                        followersLoading={followersLoading}
                        onLocateOwner={onLocateOwner}
                        onCopyOwnerNpub={onCopyOwnerNpub}
                    />
                ) : null}

                {activeTab === 'following' ? (
                    <PeopleListTab
                        people={filteredFollowingPeople}
                        profiles={profiles}
                        emptyText={followingSearch ? 'No hay resultados para esta busqueda.' : 'No hay cuentas seguidas todavía.'}
                        loading={false}
                        selectedPubkey={selectedFollowingPubkey}
                        onSelectPerson={onSelectFollowing}
                        searchQuery={followingSearch}
                        onSearchQueryChange={setFollowingSearch}
                        searchAriaLabel="Buscar en seguidos"
                    />
                ) : null}

                {activeTab === 'followers' ? (
                    <PeopleListTab
                        people={followerPeople}
                        profiles={followerProfiles}
                        emptyText="No se encontraron seguidores aún."
                        loadingText="Buscando seguidores en relays..."
                        loading={followersLoading}
                    />
                ) : null}
            </div>
        </div>
    );
}
