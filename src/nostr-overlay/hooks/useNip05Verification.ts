import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { useNip05VerificationQueries } from '../query/nip05.query';

interface UseNip05VerificationInput {
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
    maxConcurrency?: number;
}

export function useNip05Verification({
    profilesByPubkey,
    targetPubkeys,
    maxConcurrency: _maxConcurrency = 4,
}: UseNip05VerificationInput): Record<string, Nip05ValidationResult | undefined> {
    return useNip05VerificationQueries({
        profilesByPubkey,
        targetPubkeys,
    });
}
