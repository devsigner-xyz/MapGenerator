// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

import { buildApp } from '../../app';
import type { ContentService } from './content.service';

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

describe('content routes', () => {
  const contentService: ContentService = {
    getPosts: async () => ({
      posts: [
        {
          id: 'b'.repeat(64),
          pubkey: TARGET_PUBKEY,
          createdAt: 1_719_000_100,
          content: 'hello world',
        },
      ],
      nextUntil: null,
      hasMore: false,
    }),
    getProfileStats: async () => ({
      followsCount: 12,
      followersCount: 34,
    }),
  };

  const app = buildApp({ contentService });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns posts contract for valid query without auth proof', async () => {
    const url = `/v1/content/posts?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}&limit=20&until=1719000000`;
    const response = await app.inject({
      method: 'GET',
      url,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      posts: [
        {
          id: 'b'.repeat(64),
          pubkey: TARGET_PUBKEY,
          createdAt: 1_719_000_100,
          content: 'hello world',
        },
      ],
      nextUntil: null,
      hasMore: false,
    });
  });

  it('returns profile stats contract for valid query without auth proof', async () => {
    const url = `/v1/content/profile-stats?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}`;
    const response = await app.inject({
      method: 'GET',
      url,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      followsCount: 12,
      followersCount: 34,
    });
  });

  it('returns 400 when posts query has invalid limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/content/posts?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}&limit=0`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('accepts optional auth proof and still returns profile stats', async () => {
    const url = `/v1/content/profile-stats?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}`;
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
      followsCount: 12,
      followersCount: 34,
    });
  });

  it('does not require owner/auth pubkey match when auth proof is present', async () => {
    const url = `/v1/content/profile-stats?ownerPubkey=${OWNER_PUBKEY}&pubkey=${TARGET_PUBKEY}`;
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
      followsCount: 12,
      followersCount: 34,
    });
  });
});
