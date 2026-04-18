import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { Nip05Identifier } from './Nip05Identifier';

interface ProfileTabProps {
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    ownerVerification?: Nip05ValidationResult;
}

export function ProfileTab({
    ownerPubkey,
    ownerProfile,
    ownerVerification,
}: ProfileTabProps) {
    if (!ownerPubkey) {
        return <div className="nostr-profile-tab" />;
    }

    return (
        <div className="nostr-profile-tab">
            <Nip05Identifier
                {...(ownerProfile ? { profile: ownerProfile } : {})}
                {...(ownerVerification ? { verification: ownerVerification } : {})}
            />
        </div>
    );
}
