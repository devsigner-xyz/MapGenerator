import { describe, expect, test, vi } from 'vitest';

import type { HttpClient } from './http-client';
import { createGraphApiService } from './graph-api-service';

describe('createGraphApiService', () => {
    test('serializes candidate authors and maps content responses', async () => {
        const getJson = vi
            .fn()
            .mockImplementationOnce(async () => ({
                pubkey: 'a'.repeat(64),
                follows: ['b'.repeat(64)],
                relayHints: ['wss://relay.one'],
            }))
            .mockImplementationOnce(async () => ({
                pubkey: 'a'.repeat(64),
                followers: ['c'.repeat(64)],
                complete: true,
            }))
            .mockImplementationOnce(async () => ({
                posts: [
                    {
                        id: 'd'.repeat(64),
                        pubkey: 'a'.repeat(64),
                        createdAt: 1_719_000_100,
                        content: 'hello',
                    },
                ],
                hasMore: false,
                nextUntil: null,
            }))
            .mockImplementationOnce(async () => ({
                followsCount: 1,
                followersCount: 2,
            }));

        const client: HttpClient = {
            requestRaw: vi.fn(async () => new Response(null, { status: 200 })),
            requestJson: vi.fn() as unknown as HttpClient['requestJson'],
            getJson: getJson as unknown as HttpClient['getJson'],
            postJson: vi.fn() as unknown as HttpClient['postJson'],
        };

        const service = createGraphApiService({ client });

        const follows = await service.loadFollows({
            ownerPubkey: 'f'.repeat(64),
            pubkey: 'a'.repeat(64),
        });
        const followers = await service.loadFollowers({
            ownerPubkey: 'f'.repeat(64),
            pubkey: 'a'.repeat(64),
            candidateAuthors: ['c'.repeat(64), 'C'.repeat(64), ''],
        });
        const posts = await service.loadPosts({
            ownerPubkey: 'f'.repeat(64),
            pubkey: 'a'.repeat(64),
            limit: 20,
        });
        const stats = await service.loadProfileStats({
            ownerPubkey: 'f'.repeat(64),
            pubkey: 'a'.repeat(64),
            candidateAuthors: ['c'.repeat(64)],
        });

        expect(follows).toEqual({
            ownerPubkey: 'a'.repeat(64),
            follows: ['b'.repeat(64)],
            relayHints: ['wss://relay.one'],
        });
        expect(followers).toEqual({
            followers: ['c'.repeat(64)],
            complete: true,
        });
        expect(posts.hasMore).toBe(false);
        expect(posts.posts[0]?.id).toBe('d'.repeat(64));
        expect(stats).toEqual({
            followsCount: 1,
            followersCount: 2,
        });

        expect(getJson).toHaveBeenNthCalledWith(2, '/graph/followers', expect.objectContaining({
            query: expect.objectContaining({
                candidateAuthors: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
            }),
        }));
    });
});
