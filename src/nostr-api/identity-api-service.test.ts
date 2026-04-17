import { describe, expect, test, vi } from 'vitest';

import type { HttpClient } from './http-client';
import { createIdentityApiService } from './identity-api-service';

describe('createIdentityApiService', () => {
    test('maps nip05 batch dto to validation result map entries', async () => {
        const postJson = vi.fn(async () => ({
            results: [
                {
                    pubkey: 'a'.repeat(64),
                    nip05: 'alice@example.com',
                    status: 'verified',
                    identifier: 'alice@example.com',
                    displayIdentifier: 'alice@example.com',
                    resolvedPubkey: 'a'.repeat(64),
                    checkedAt: 1,
                },
            ],
        }));
        const client: HttpClient = {
            requestRaw: vi.fn(async () => new Response(null, { status: 200 })),
            requestJson: vi.fn() as unknown as HttpClient['requestJson'],
            getJson: vi.fn() as unknown as HttpClient['getJson'],
            postJson: postJson as unknown as HttpClient['postJson'],
        };

        const service = createIdentityApiService({ client });
        const result = await service.verifyNip05Batch({
            ownerPubkey: 'f'.repeat(64),
            checks: [{ pubkey: 'a'.repeat(64), nip05: 'alice@example.com' }],
        });

        expect(result).toEqual([
            {
                pubkey: 'a'.repeat(64),
                result: {
                    status: 'verified',
                    identifier: 'alice@example.com',
                    displayIdentifier: 'alice@example.com',
                    resolvedPubkey: 'a'.repeat(64),
                    error: undefined,
                    checkedAt: 1,
                },
            },
        ]);
    });

    test('chunks profile resolve requests to backend max payload size', async () => {
        const firstBatchPubkeys = Array.from(
            { length: 200 },
            (_, index) => `f${index.toString(16).padStart(63, '0')}`,
        );
        const secondBatchPubkeys = Array.from(
            { length: 50 },
            (_, index) => `e${(index + 200).toString(16).padStart(63, '0')}`,
        );
        const allPubkeys = [...firstBatchPubkeys, ...secondBatchPubkeys];

        const postJson = vi
            .fn()
            .mockImplementationOnce(async () => ({
                profiles: Object.fromEntries(firstBatchPubkeys.map((pubkey) => [pubkey, {
                    pubkey,
                    createdAt: 1,
                }])),
            }))
            .mockImplementationOnce(async () => ({
                profiles: Object.fromEntries(secondBatchPubkeys.map((pubkey) => [pubkey, {
                    pubkey,
                    createdAt: 2,
                }])),
            }));

        const client: HttpClient = {
            requestRaw: vi.fn(async () => new Response(null, { status: 200 })),
            requestJson: vi.fn() as unknown as HttpClient['requestJson'],
            getJson: vi.fn() as unknown as HttpClient['getJson'],
            postJson: postJson as unknown as HttpClient['postJson'],
        };

        const service = createIdentityApiService({ client });
        const profiles = await service.resolveProfiles({
            ownerPubkey: 'f'.repeat(64),
            pubkeys: allPubkeys,
        });

        expect(postJson).toHaveBeenCalledTimes(2);
        expect(postJson).toHaveBeenNthCalledWith(1, '/identity/profiles/resolve', {
            body: {
                ownerPubkey: 'f'.repeat(64),
                pubkeys: firstBatchPubkeys,
            },
        });
        expect(postJson).toHaveBeenNthCalledWith(2, '/identity/profiles/resolve', {
            body: {
                ownerPubkey: 'f'.repeat(64),
                pubkeys: secondBatchPubkeys,
            },
        });
        expect(Object.keys(profiles)).toHaveLength(250);
    });
});
