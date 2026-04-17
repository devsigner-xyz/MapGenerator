import { describe, expect, test, vi } from 'vitest';
import type { HttpClient } from './http-client';
import { createSocialNotificationsApiService } from './social-notifications-api-service';

interface NotificationsResponseDto {
    items: Array<{
        id: string;
        kind: number;
        actorPubkey: string;
        createdAt: number;
        targetEventId: string | null;
        targetPubkey: string | null;
        rawEvent: {
            id: string;
            pubkey: string;
            kind: number;
            createdAt: number;
            content: string;
            tags: string[][];
        };
    }>;
    hasMore: boolean;
    nextSince: number | null;
}

describe('createSocialNotificationsApiService', () => {
    test('clamps outgoing list limit to backend max', async () => {
        const ownerPubkey = 'a'.repeat(64);
        const response: NotificationsResponseDto = {
            items: [],
            hasMore: false,
            nextSince: null,
        };
        const getJson = vi.fn(async () => response);
        const client: HttpClient = {
            requestRaw: vi.fn(async () => new Response(null, { status: 200 })),
            requestJson: vi.fn(async () => response) as unknown as HttpClient['requestJson'],
            getJson: getJson as unknown as HttpClient['getJson'],
            postJson: vi.fn(async () => response) as unknown as HttpClient['postJson'],
        };

        const service = createSocialNotificationsApiService({ client });

        await service.loadInitialSocial({
            ownerPubkey,
            limit: 1000,
        });

        expect(getJson).toHaveBeenCalledWith('/notifications', expect.objectContaining({
            query: expect.objectContaining({
                limit: 100,
            }),
        }));
    });
});
