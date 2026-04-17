import { describe, expect, test, vi } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

import type { HttpClient } from './http-client';
import { createDmApiService } from './dm-api-service';

interface DmEventDto {
    id: string;
    pubkey: string;
    kind: number;
    createdAt: number;
    content: string;
    tags: string[][];
}

interface DmEventsResponseDto {
    items: DmEventDto[];
    hasMore: boolean;
    nextSince: number | null;
}

function createHttpClientStub(response: DmEventsResponseDto): HttpClient {
    const requestJson = vi.fn(async () => response) as unknown as HttpClient['requestJson'];
    const getJson = vi.fn(async () => response) as unknown as HttpClient['getJson'];
    const postJson = vi.fn(async () => response) as unknown as HttpClient['postJson'];

    return {
        requestRaw: vi.fn(async () => new Response(null, { status: 200 })),
        requestJson,
        getJson,
        postJson,
    };
}

function hexToBytes(hex: string): Uint8Array {
    const pairs = hex.match(/.{1,2}/g);
    if (!pairs) {
        return new Uint8Array();
    }

    return Uint8Array.from(pairs.map((pair) => Number.parseInt(pair, 16)));
}

describe('createDmApiService', () => {
    test('decrypts kind 4 events when decryptDm is provided', async () => {
        const ownerPubkey = 'a'.repeat(64);
        const peerPubkey = 'b'.repeat(64);
        const encryptedContent = 'nip04:ciphertext';
        const client = createHttpClientStub({
            items: [
                {
                    id: 'c'.repeat(64),
                    pubkey: peerPubkey,
                    kind: 4,
                    createdAt: 1_700_000_000,
                    content: encryptedContent,
                    tags: [['p', ownerPubkey]],
                },
            ],
            hasMore: false,
            nextSince: null,
        });
        const decryptDm = vi.fn(async () => 'hola desde nip04');

        const service = createDmApiService({
            client,
            decryptDm,
        });

        const messages = await service.loadConversationMessages({
            ownerPubkey,
            peerPubkey,
        });

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            conversationId: peerPubkey,
            peerPubkey,
            direction: 'incoming',
            plaintext: 'hola desde nip04',
        });
        expect(messages[0]?.isUndecryptable).not.toBe(true);
        expect(decryptDm).toHaveBeenCalledWith(peerPubkey, encryptedContent, 'nip04');
    });

    test('decrypts gift wrap events when decryptDm is provided', async () => {
        const ownerPubkey = 'a'.repeat(64);
        const peerSecret = hexToBytes('11'.repeat(32));
        const wrapSecret = hexToBytes('22'.repeat(32));
        const peerPubkey = getPublicKey(peerSecret);

        const rumorEvent = finalizeEvent({
            kind: 14,
            created_at: 1_700_000_200,
            tags: [['p', ownerPubkey]],
            content: 'hola desde giftwrap',
        }, peerSecret);

        const sealCiphertext = 'nip44:seal-cipher';
        const sealEvent = finalizeEvent({
            kind: 13,
            created_at: 1_700_000_201,
            tags: [],
            content: sealCiphertext,
        }, peerSecret);

        const giftWrapCiphertext = 'nip44:giftwrap-cipher';
        const giftWrapEvent = finalizeEvent({
            kind: 1059,
            created_at: 1_700_000_202,
            tags: [['p', ownerPubkey]],
            content: giftWrapCiphertext,
        }, wrapSecret);

        const client = createHttpClientStub({
            items: [
                {
                    id: giftWrapEvent.id,
                    pubkey: giftWrapEvent.pubkey,
                    kind: giftWrapEvent.kind,
                    createdAt: giftWrapEvent.created_at,
                    content: giftWrapEvent.content,
                    tags: giftWrapEvent.tags,
                },
            ],
            hasMore: false,
            nextSince: null,
        });

        const decryptDm = vi.fn(async (_pubkey: string, ciphertext: string) => {
            if (ciphertext === giftWrapCiphertext) {
                return JSON.stringify(sealEvent);
            }

            if (ciphertext === sealCiphertext) {
                return JSON.stringify(rumorEvent);
            }

            throw new Error('unexpected ciphertext');
        });

        const service = createDmApiService({
            client,
            decryptDm,
        });

        const messages = await service.loadInitialConversations({ ownerPubkey });

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            conversationId: peerPubkey,
            peerPubkey,
            direction: 'incoming',
            plaintext: 'hola desde giftwrap',
        });
        expect(messages[0]?.isUndecryptable).not.toBe(true);
        expect(decryptDm).toHaveBeenCalledTimes(2);
    });
});
