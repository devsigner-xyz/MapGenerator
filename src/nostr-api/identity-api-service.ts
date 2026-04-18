import type { Nip05ValidationResult } from '../nostr/nip05';
import type { NostrProfile } from '../nostr/types';
import { createHttpClient, type HttpClient } from './http-client';

export interface Nip05VerifyBatchCheckInput {
    pubkey: string;
    nip05: string;
}

export interface VerifyNip05BatchInput {
    ownerPubkey: string;
    checks: Nip05VerifyBatchCheckInput[];
    timeoutMs?: number;
}

export interface VerifyNip05BatchResultItem {
    pubkey: string;
    result: Nip05ValidationResult;
}

export interface ResolveProfilesInput {
    ownerPubkey: string;
    pubkeys: string[];
}

export interface IdentityApiService {
    verifyNip05Batch(input: VerifyNip05BatchInput): Promise<VerifyNip05BatchResultItem[]>;
    resolveProfiles(input: ResolveProfilesInput): Promise<Record<string, NostrProfile>>;
}

export interface CreateIdentityApiServiceOptions {
    client?: HttpClient;
}

const RESOLVE_PROFILES_MAX_BATCH_SIZE = 200;
const VERIFY_NIP05_MAX_BATCH_SIZE = 50;

function chunkValues<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }

    return chunks;
}

interface VerifyNip05BatchResponseDto {
    results: Array<{
        pubkey: string;
        nip05: string;
        status: Nip05ValidationResult['status'];
        identifier: string;
        displayIdentifier?: string;
        resolvedPubkey?: string;
        error?: string;
        checkedAt: number;
    }>;
}

interface ResolveProfilesResponseDto {
    profiles: Record<string, {
        pubkey: string;
        createdAt: number;
        name?: string;
        displayName?: string;
        about?: string;
        nip05?: string;
        picture?: string;
        banner?: string;
        lud16?: string;
    }>;
}

function mapProfile(dto: ResolveProfilesResponseDto['profiles'][string]): NostrProfile {
    const profile: NostrProfile = {
        pubkey: dto.pubkey,
    };

    if (dto.name !== undefined) {
        profile.name = dto.name;
    }
    if (dto.displayName !== undefined) {
        profile.displayName = dto.displayName;
    }
    if (dto.about !== undefined) {
        profile.about = dto.about;
    }
    if (dto.nip05 !== undefined) {
        profile.nip05 = dto.nip05;
    }
    if (dto.picture !== undefined) {
        profile.picture = dto.picture;
    }
    if (dto.banner !== undefined) {
        profile.banner = dto.banner;
    }
    if (dto.lud16 !== undefined) {
        profile.lud16 = dto.lud16;
    }

    return profile;
}

export function createIdentityApiService(options: CreateIdentityApiServiceOptions = {}): IdentityApiService {
    const client = options.client ?? createHttpClient();

    return {
        async verifyNip05Batch(input) {
            if (!input.checks || input.checks.length === 0) {
                return [];
            }

            const batches = chunkValues(input.checks, VERIFY_NIP05_MAX_BATCH_SIZE);
            const aggregatedResults: VerifyNip05BatchResultItem[] = [];

            for (const checks of batches) {
                const response = await client.postJson<VerifyNip05BatchResponseDto>('/identity/nip05/verify-batch', {
                    body: {
                        ownerPubkey: input.ownerPubkey,
                        checks,
                        timeoutMs: input.timeoutMs,
                    },
                });

                aggregatedResults.push(...response.results.map((item) => {
                    const result: Nip05ValidationResult = {
                        status: item.status,
                        identifier: item.identifier,
                        checkedAt: item.checkedAt,
                    };
                    if (item.displayIdentifier !== undefined) {
                        result.displayIdentifier = item.displayIdentifier;
                    }
                    if (item.resolvedPubkey !== undefined) {
                        result.resolvedPubkey = item.resolvedPubkey;
                    }
                    if (item.error !== undefined) {
                        result.error = item.error;
                    }

                    return {
                        pubkey: item.pubkey,
                        result,
                    };
                }));
            }

            return aggregatedResults;
        },

        async resolveProfiles(input) {
            if (!input.pubkeys || input.pubkeys.length === 0) {
                return {};
            }

            const profiles: Record<string, NostrProfile> = {};
            const uniquePubkeys = [...new Set(input.pubkeys)];
            const batches = chunkValues(uniquePubkeys, RESOLVE_PROFILES_MAX_BATCH_SIZE);

            for (const pubkeys of batches) {
                const response = await client.postJson<ResolveProfilesResponseDto>('/identity/profiles/resolve', {
                    body: {
                        ownerPubkey: input.ownerPubkey,
                        pubkeys,
                    },
                });

                for (const [pubkey, profile] of Object.entries(response.profiles)) {
                    profiles[pubkey] = mapProfile(profile);
                }
            }

            return profiles;
        },
    };
}
