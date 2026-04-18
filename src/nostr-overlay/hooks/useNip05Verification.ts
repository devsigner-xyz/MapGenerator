import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import type { IdentityApiService } from '../../nostr-api/identity-api-service';
import { useNip05VerificationQueries } from '../query/nip05.query';

interface UseNip05VerificationInput {
    ownerPubkey?: string;
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
    maxConcurrency?: number;
    identityApiService?: IdentityApiService;
}

export function useNip05Verification({
    ownerPubkey,
    profilesByPubkey,
    targetPubkeys,
    maxConcurrency: _maxConcurrency = 4,
    identityApiService,
}: UseNip05VerificationInput): Record<string, Nip05ValidationResult | undefined> {
    return useNip05VerificationQueries({
        ...(ownerPubkey ? { ownerPubkey } : {}),
        profilesByPubkey,
        targetPubkeys,
        ...(identityApiService ? { identityApiService } : {}),
    });
}
