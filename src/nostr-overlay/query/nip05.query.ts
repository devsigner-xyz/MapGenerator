import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { validateNip05Identifier, type Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { createIdentityQueryOptions } from './options';

interface UseNip05VerificationQueriesInput {
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
}

interface VerificationPlan {
    pubkey: string;
    nip05: string;
    normalizedNip05: string;
}

function dedupe(values: string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
}

function normalizeNip05(value: string): string {
    return value.trim().toLowerCase();
}

function normalizePubkey(value: string): string {
    return value.trim().toLowerCase();
}

function indexProfilesByNormalizedPubkey(profilesByPubkey: Record<string, NostrProfile>): Map<string, NostrProfile> {
    const indexed = new Map<string, NostrProfile>();
    for (const [key, profile] of Object.entries(profilesByPubkey)) {
        const normalizedKey = normalizePubkey(key || profile.pubkey);
        if (!normalizedKey || indexed.has(normalizedKey)) {
            continue;
        }

        indexed.set(normalizedKey, profile);
    }

    return indexed;
}

function buildPlans(input: UseNip05VerificationQueriesInput): VerificationPlan[] {
    const profilesByNormalizedPubkey = indexProfilesByNormalizedPubkey(input.profilesByPubkey);
    const sortedNormalizedPubkeys = dedupe(input.targetPubkeys.map(normalizePubkey)).sort((left, right) => left.localeCompare(right));
    const plansByIdentity = new Map<string, VerificationPlan>();

    for (const normalizedPubkey of sortedNormalizedPubkeys) {
        const profile = profilesByNormalizedPubkey.get(normalizedPubkey);
        const nip05 = profile?.nip05?.trim() ?? '';
        const normalizedNip05 = normalizeNip05(nip05);
        if (!normalizedNip05) {
            continue;
        }

        const identityKey = `${normalizedPubkey}::${normalizedNip05}`;
        if (plansByIdentity.has(identityKey)) {
            continue;
        }

        plansByIdentity.set(identityKey, {
            pubkey: normalizedPubkey,
            nip05,
            normalizedNip05,
        });
    }

    return [...plansByIdentity.values()];
}

export function useNip05VerificationQueries(
    input: UseNip05VerificationQueriesInput
): Record<string, Nip05ValidationResult | undefined> {
    const plans = useMemo(() => buildPlans(input), [input.profilesByPubkey, input.targetPubkeys]);

    return useQueries({
        queries: plans.map((plan) => createIdentityQueryOptions({
            queryKey: ['nostr-overlay', 'social', 'nip05', { pubkey: plan.pubkey, nip05: plan.normalizedNip05 }] as const,
            queryFn: () => validateNip05Identifier({
                pubkey: plan.pubkey,
                nip05: plan.normalizedNip05,
            }),
        })),
        combine: (queryResults) => {
            const verificationByPubkey: Record<string, Nip05ValidationResult | undefined> = {};
            for (const [index, plan] of plans.entries()) {
                verificationByPubkey[plan.pubkey] = queryResults[index]?.data;
            }

            return verificationByPubkey;
        },
    });
}
