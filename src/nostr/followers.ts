import { parseFollowsFromKind3 } from './follows';
import type { NostrClient } from './types';

interface FetchFollowersBestEffortInput {
    targetPubkey: string;
    client: NostrClient;
    maxBatches?: number;
    batchLimit?: number;
    candidateAuthors?: string[];
    candidateAuthorBatchSize?: number;
    startUntil?: number;
    onBatch?: (batch: {
        newFollowers: string[];
        totalFollowers: number;
        done: boolean;
    }) => void | Promise<void>;
}

interface FetchFollowersBestEffortResult {
    followers: string[];
    scannedBatches: number;
    complete: boolean;
}

function chunkArray<T>(values: T[], size: number): T[][] {
    const safeSize = Math.max(1, size);
    const chunks: T[][] = [];

    for (let i = 0; i < values.length; i += safeSize) {
        chunks.push(values.slice(i, i + safeSize));
    }

    return chunks;
}

function collectFollowersFromEvents(input: {
    events: Awaited<ReturnType<NostrClient['fetchEvents']>>;
    targetPubkey: string;
    followers: Set<string>;
}): { newFollowers: string[]; minCreatedAt: number } {
    let minCreatedAt = Infinity;
    const newFollowers: string[] = [];

    for (const event of input.events) {
        minCreatedAt = Math.min(minCreatedAt, event.created_at);

        const follows = parseFollowsFromKind3(event);
        if (!follows.includes(input.targetPubkey)) {
            continue;
        }

        if (input.followers.has(event.pubkey)) {
            continue;
        }

        input.followers.add(event.pubkey);
        newFollowers.push(event.pubkey);
    }

    return {
        newFollowers,
        minCreatedAt,
    };
}

export async function fetchFollowersBestEffort(
    input: FetchFollowersBestEffortInput
): Promise<FetchFollowersBestEffortResult> {
    const maxBatches = Math.max(1, input.maxBatches ?? 3);
    const batchLimit = Math.max(1, input.batchLimit ?? 120);
    const candidateAuthorBatchSize = Math.max(1, input.candidateAuthorBatchSize ?? 40);
    const candidateAuthors = [...new Set(input.candidateAuthors ?? [])].filter((pubkey) => pubkey !== input.targetPubkey);
    let until = input.startUntil;

    const followers = new Set<string>();
    let scannedBatches = 0;
    let exhaustedTagSearch = false;

    await input.client.connect();

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex++) {
        const events = await input.client.fetchEvents({
            kinds: [3],
            '#p': [input.targetPubkey],
            until,
            limit: batchLimit,
        });

        if (events.length === 0) {
            exhaustedTagSearch = true;
            break;
        }

        scannedBatches += 1;

        const { newFollowers, minCreatedAt } = collectFollowersFromEvents({
            events,
            targetPubkey: input.targetPubkey,
            followers,
        });

        const isLastBatch = events.length < batchLimit || batchIndex === maxBatches - 1;

        if (newFollowers.length > 0) {
            await input.onBatch?.({
                newFollowers,
                totalFollowers: followers.size,
                done: false,
            });
        }

        if (isLastBatch) {
            exhaustedTagSearch = events.length < batchLimit;
            break;
        }

        until = Number.isFinite(minCreatedAt) ? minCreatedAt - 1 : until;
    }

    for (const authorBatch of chunkArray(candidateAuthors, candidateAuthorBatchSize)) {
        const events = await input.client.fetchEvents({
            kinds: [3],
            authors: authorBatch,
            limit: Math.max(batchLimit, authorBatch.length * 3),
        });

        if (events.length === 0) {
            continue;
        }

        scannedBatches += 1;

        const { newFollowers } = collectFollowersFromEvents({
            events,
            targetPubkey: input.targetPubkey,
            followers,
        });

        if (newFollowers.length > 0) {
            await input.onBatch?.({
                newFollowers,
                totalFollowers: followers.size,
                done: false,
            });
        }
    }

    return {
        followers: [...followers],
        scannedBatches,
        complete: exhaustedTagSearch,
    };
}
