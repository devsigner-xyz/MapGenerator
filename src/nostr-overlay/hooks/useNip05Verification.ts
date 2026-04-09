import { useEffect, useMemo, useState } from 'react';
import { validateNip05Identifier, type Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';

interface UseNip05VerificationInput {
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
    maxConcurrency?: number;
}

function dedupe(values: string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
}

export function useNip05Verification({
    profilesByPubkey,
    targetPubkeys,
    maxConcurrency = 4,
}: UseNip05VerificationInput): Record<string, Nip05ValidationResult | undefined> {
    const [verificationByPubkey, setVerificationByPubkey] = useState<Record<string, Nip05ValidationResult | undefined>>({});

    const plans = useMemo(() => {
        const uniquePubkeys = dedupe(targetPubkeys);
        return uniquePubkeys
            .map((pubkey) => ({
                pubkey,
                nip05: profilesByPubkey[pubkey]?.nip05,
            }))
            .filter((entry) => Boolean(entry.nip05));
    }, [profilesByPubkey, targetPubkeys]);

    useEffect(() => {
        let cancelled = false;

        setVerificationByPubkey((current) => {
            const next: Record<string, Nip05ValidationResult | undefined> = {};
            for (const { pubkey } of plans) {
                next[pubkey] = current[pubkey];
            }
            return next;
        });

        if (plans.length === 0) {
            return () => {
                cancelled = true;
            };
        }

        const workerCount = Math.max(1, Math.min(maxConcurrency, plans.length));
        let cursor = 0;

        const runWorker = async (): Promise<void> => {
            while (!cancelled && cursor < plans.length) {
                const nextIndex = cursor;
                cursor += 1;
                const plan = plans[nextIndex];
                if (!plan) {
                    continue;
                }

                const result = await validateNip05Identifier({
                    pubkey: plan.pubkey,
                    nip05: plan.nip05,
                });

                if (cancelled) {
                    return;
                }

                setVerificationByPubkey((current) => {
                    if (current[plan.pubkey]?.checkedAt === result.checkedAt) {
                        return current;
                    }

                    return {
                        ...current,
                        [plan.pubkey]: result,
                    };
                });
            }
        };

        void Promise.all(Array.from({ length: workerCount }, () => runWorker()));

        return () => {
            cancelled = true;
        };
    }, [plans, maxConcurrency]);

    return verificationByPubkey;
}
