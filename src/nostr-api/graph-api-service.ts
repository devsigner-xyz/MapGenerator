import type { FetchLatestPostsByPubkeyResult } from '../nostr/posts';
import type { ProfileStats } from '../nostr/profile-stats';
import type { FollowGraphResult } from '../nostr/types';
import { createHttpClient, type HttpClient } from './http-client';

interface GraphFollowsResponseDto {
    pubkey: string;
    follows: string[];
    relayHints: string[];
}

interface GraphFollowersResponseDto {
    pubkey: string;
    followers: string[];
    complete: boolean;
}

interface ContentPostsResponseDto {
    posts: Array<{
        id: string;
        pubkey: string;
        createdAt: number;
        content: string;
    }>;
    nextUntil: number | null;
    hasMore: boolean;
}

interface ProfileStatsResponseDto {
    followsCount: number;
    followersCount: number;
}

export interface GraphApiService {
    loadFollows(input: { ownerPubkey: string; pubkey: string }): Promise<FollowGraphResult>;
    loadFollowers(input: { ownerPubkey: string; pubkey: string; candidateAuthors?: string[] }): Promise<{ followers: string[]; complete: boolean }>;
    loadPosts(input: { ownerPubkey: string; pubkey: string; limit?: number; until?: number }): Promise<FetchLatestPostsByPubkeyResult>;
    loadProfileStats(input: { ownerPubkey: string; pubkey: string; candidateAuthors?: string[] }): Promise<ProfileStats>;
}

export interface CreateGraphApiServiceOptions {
    client?: HttpClient;
}

function toCandidateAuthorsList(authors?: string[]): string[] | undefined {
    if (!authors || authors.length === 0) {
        return undefined;
    }

    return [...new Set(authors.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0))]
}

export function createGraphApiService(options: CreateGraphApiServiceOptions = {}): GraphApiService {
    const client = options.client ?? createHttpClient();

    return {
        async loadFollows(input) {
            const response = await client.getJson<GraphFollowsResponseDto>('/graph/follows', {
                query: {
                    ownerPubkey: input.ownerPubkey,
                    pubkey: input.pubkey,
                },
            });

            return {
                ownerPubkey: response.pubkey,
                follows: response.follows,
                relayHints: response.relayHints,
            };
        },

        async loadFollowers(input) {
            const response = await client.postJson<GraphFollowersResponseDto>('/graph/followers', {
                body: {
                    ownerPubkey: input.ownerPubkey,
                    pubkey: input.pubkey,
                    candidateAuthors: toCandidateAuthorsList(input.candidateAuthors),
                },
            });

            return {
                followers: response.followers,
                complete: response.complete,
            };
        },

        async loadPosts(input) {
            const response = await client.getJson<ContentPostsResponseDto>('/content/posts', {
                query: {
                    ownerPubkey: input.ownerPubkey,
                    pubkey: input.pubkey,
                    limit: input.limit ?? 20,
                    until: input.until,
                },
            });

            const result: FetchLatestPostsByPubkeyResult = {
                posts: response.posts,
                hasMore: response.hasMore,
            };

            if (typeof response.nextUntil === 'number') {
                result.nextUntil = response.nextUntil;
            }

            return result;
        },

        async loadProfileStats(input) {
            return client.postJson<ProfileStatsResponseDto>('/content/profile-stats', {
                body: {
                    ownerPubkey: input.ownerPubkey,
                    pubkey: input.pubkey,
                    candidateAuthors: toCandidateAuthorsList(input.candidateAuthors),
                },
            });
        },
    };
}
