import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { validateNip05Identifier, type Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';

interface UseNip05VerificationQueriesInput {
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
}

interface VerificationPlan {
    pubkey: string;
    nip05: string;
}

const NIP05_STALE_TIME_MS = 15 * 60_000;

function dedupe(values: string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
}

function normalizeNip05(value: string): string {
    return value.trim().toLowerCase();
}

function buildPlans(input: UseNip05VerificationQueriesInput): VerificationPlan[] {
    return dedupe(input.targetPubkeys)
        .map((pubkey) => ({
            pubkey,
            nip05: input.profilesByPubkey[pubkey]?.nip05?.trim() ?? '',
        }))
        .filter((entry) => entry.nip05.length > 0);
}

export function useNip05VerificationQueries(
    input: UseNip05VerificationQueriesInput
): Record<string, Nip05ValidationResult | undefined> {
    const plans = useMemo(() => buildPlans(input), [input.profilesByPubkey, input.targetPubkeys]);

    const queryResults = useQueries({
        queries: plans.map((plan) => ({
            queryKey: ['nostr-overlay', 'social', 'nip05', { pubkey: plan.pubkey, nip05: normalizeNip05(plan.nip05) }] as const,
            queryFn: () => validateNip05Identifier({
                pubkey: plan.pubkey,
                nip05: plan.nip05,
            }),
            staleTime: NIP05_STALE_TIME_MS,
        })),
    });

    return useMemo(() => {
        const verificationByPubkey: Record<string, Nip05ValidationResult | undefined> = {};
        for (const [index, plan] of plans.entries()) {
            verificationByPubkey[plan.pubkey] = queryResults[index]?.data;
        }

        return verificationByPubkey;
    }, [plans, queryResults]);
}
