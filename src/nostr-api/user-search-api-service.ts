import type { NostrProfile } from '../nostr/types';
import type { SearchUsersResult } from '../nostr-overlay/query/user-search.query';
import { createHttpClient, type HttpClient } from './http-client';

interface UserProfileDto {
    pubkey: string;
    createdAt: number;
    name?: string;
    displayName?: string;
    about?: string;
    nip05?: string;
    picture?: string;
    banner?: string;
    lud16?: string;
}

interface UsersSearchResponseDto {
    pubkeys: string[];
    profiles: Record<string, UserProfileDto>;
}

export interface SearchUsersApiInput {
    ownerPubkey: string;
    q: string;
    limit?: number;
}

export interface UserSearchApiService {
    searchUsers(input: SearchUsersApiInput): Promise<SearchUsersResult>;
}

export interface CreateUserSearchApiServiceOptions {
    client?: HttpClient;
}

function mapProfile(dto: UserProfileDto): NostrProfile {
    return {
        pubkey: dto.pubkey,
        name: dto.name,
        displayName: dto.displayName,
        about: dto.about,
        picture: dto.picture,
        banner: dto.banner,
        nip05: dto.nip05,
        lud16: dto.lud16,
    };
}

export function createUserSearchApiService(options: CreateUserSearchApiServiceOptions = {}): UserSearchApiService {
    const client = options.client ?? createHttpClient();

    return {
        async searchUsers(input) {
            const response = await client.getJson<UsersSearchResponseDto>('/users/search', {
                query: {
                    ownerPubkey: input.ownerPubkey,
                    q: input.q,
                    limit: input.limit ?? 20,
                },
            });

            const profiles: Record<string, NostrProfile> = {};
            for (const [pubkey, profile] of Object.entries(response.profiles)) {
                profiles[pubkey] = mapProfile(profile);
            }

            return {
                pubkeys: response.pubkeys,
                profiles,
            };
        },
    };
}
