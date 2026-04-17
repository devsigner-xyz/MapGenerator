// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

import { buildApp } from '../../app';
import type { GraphService } from './graph.service';

const HOST = 'api.local.test';
const OWNER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x11));
const OTHER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x22));
const OWNER_PUBKEY = getPublicKey(OWNER_SECRET_KEY);
const TARGET_PUBKEY = 'a'.repeat(64);

const buildNostrAuthHeader = ({
  secretKey,
  method,
  url,
}: {
  secretKey: Uint8Array;
  method: string;
  url: string;
}): string => {
  const event = finalizeEvent(
    {
      kind: 27_235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['u', url],
        ['method', method.toUpperCase()],
        ['nonce', `nonce-${Math.random().toString(16).slice(2, 12)}`],
      ],
      content: '',
    },
    secretKey,
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
};

describe('graph routes', () => {
  const graphService: GraphService = {
    getFollows: async () => ({
      pubkey: TARGET_PUBKEY,
      follows: ['b'.repeat(64)],
      relayHints: ['wss://relay.one'],
    }),
    getFollowers: async () => ({
      pubkey: TARGET_PUBKEY,
      followers: ['c'.repeat(64)],
      complete: true,
    }),
  };

  const app = buildApp({ graphService });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns follows contract for valid query without auth proof', async () => {
    const url = `/v1/graph/follows?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}`;
    const response = await app.inject({
      method: 'GET',
      url,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pubkey: TARGET_PUBKEY,
      follows: ['b'.repeat(64)],
      relayHints: ['wss://relay.one'],
    });
  });

  it('returns followers contract for valid query without auth proof', async () => {
    const url = `/v1/graph/followers?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}`;
    const response = await app.inject({
      method: 'GET',
      url,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pubkey: TARGET_PUBKEY,
      followers: ['c'.repeat(64)],
      complete: true,
    });
  });

  it('returns 400 when follows query is missing ownerPubkey', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/graph/follows?pubkey=${TARGET_PUBKEY}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('accepts optional auth proof and still returns followers', async () => {
    const url = `/v1/graph/followers?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}`;
    const response = await app.inject({
      method: 'GET',
      url,
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'GET',
          url: `http://${HOST}${url}`,
        }),
        host: HOST,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pubkey: TARGET_PUBKEY,
      followers: ['c'.repeat(64)],
      complete: true,
    });
  });

  it('does not require owner/auth pubkey match when auth proof is present', async () => {
    const url = `/v1/graph/follows?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}`;
    const response = await app.inject({
      method: 'GET',
      url,
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OTHER_SECRET_KEY,
          method: 'GET',
          url: `http://${HOST}${url}`,
        }),
        host: HOST,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pubkey: TARGET_PUBKEY,
      follows: ['b'.repeat(64)],
      relayHints: ['wss://relay.one'],
    });
  });
});
