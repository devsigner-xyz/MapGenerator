import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import {
    createIdentityApiService,
    type IdentityApiService,
} from '../../nostr-api/identity-api-service';
import { nostrOverlayQueryKeys } from './keys';
import { createIdentityQueryOptions } from './options';

interface UseNip05VerificationQueriesInput {
    ownerPubkey?: string;
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
    identityApiService?: IdentityApiService;
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
    const identityApiService = useMemo(
        () => input.identityApiService ?? createIdentityApiService(),
        [input.identityApiService],
    );

    const query = useQuery(createIdentityQueryOptions({
        queryKey: nostrOverlayQueryKeys.nip05Batch({
            ownerPubkey: input.ownerPubkey || '__none__',
            checks: plans.map((plan) => `${plan.pubkey}::${plan.normalizedNip05}`),
        }),
        queryFn: async (): Promise<Record<string, Nip05ValidationResult | undefined>> => {
            if (!input.ownerPubkey || plans.length === 0) {
                return {};
            }

            const results = await identityApiService.verifyNip05Batch({
                ownerPubkey: input.ownerPubkey,
                checks: plans.map((plan) => ({
                    pubkey: plan.pubkey,
                    nip05: plan.normalizedNip05,
                })),
            });

            const verificationByPubkey: Record<string, Nip05ValidationResult | undefined> = {};
            for (const item of results) {
                verificationByPubkey[item.pubkey] = item.result;
            }

            return verificationByPubkey;
        },
        enabled: Boolean(input.ownerPubkey && plans.length > 0),
    }));

    return query.data ?? {};
}
