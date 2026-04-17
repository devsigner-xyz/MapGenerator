// @vitest-environment node

import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

import { buildApp } from '../../app';
import type { IdentityService } from './identity.service';

const HOST = 'api.local.test';
const OWNER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x11));
const OTHER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x22));
const OWNER_PUBKEY = getPublicKey(OWNER_SECRET_KEY);
const PROFILE_PUBKEY = 'a'.repeat(64);

const buildNostrAuthHeader = ({
  secretKey,
  method,
  url,
  payload,
}: {
  secretKey: Uint8Array;
  method: string;
  url: string;
  payload?: unknown;
}): string => {
  const normalizedMethod = method.toUpperCase();
  const tags: string[][] = [
    ['u', url],
    ['method', normalizedMethod],
    ['nonce', `nonce-${Math.random().toString(16).slice(2, 12)}`],
  ];

  if (payload !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
    const serializedPayload = JSON.stringify(payload);
    const payloadHash = createHash('sha256').update(serializedPayload).digest('hex');
    tags.push(['payload', payloadHash]);
  }

  const event = finalizeEvent(
    {
      kind: 27_235,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    },
    secretKey,
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
};

describe('identity routes', () => {
  const identityService: IdentityService = {
    verifyNip05Batch: async (input) => ({
      results: input.checks.map((check) => ({
        pubkey: check.pubkey,
        nip05: check.nip05,
        status: 'verified' as const,
        identifier: check.nip05.toLowerCase(),
        displayIdentifier: check.nip05.toLowerCase(),
        resolvedPubkey: check.pubkey,
        checkedAt: 1_719_000_100,
      })),
    }),
    resolveProfiles: async (input) => ({
      profiles: Object.fromEntries(
        input.pubkeys.map((pubkey) => [
          pubkey,
          {
            pubkey,
            createdAt: 1_719_000_100,
            name: 'alice',
          },
        ]),
      ),
    }),
  };

  const app = buildApp({ identityService });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns nip05 batch verification contract for valid request without auth proof', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      checks: [
        {
          pubkey: PROFILE_PUBKEY,
          nip05: 'alice@example.com',
        },
      ],
    };
    const url = '/v1/identity/nip05/verify-batch';
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      results: [
        {
          pubkey: PROFILE_PUBKEY,
          nip05: 'alice@example.com',
          status: 'verified',
          identifier: 'alice@example.com',
          displayIdentifier: 'alice@example.com',
          resolvedPubkey: PROFILE_PUBKEY,
          checkedAt: 1_719_000_100,
        },
      ],
    });
  });

  it('returns profiles resolve contract for valid request without auth proof', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      pubkeys: [PROFILE_PUBKEY],
    };
    const url = '/v1/identity/profiles/resolve';
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profiles: {
        [PROFILE_PUBKEY]: {
          pubkey: PROFILE_PUBKEY,
          createdAt: 1_719_000_100,
          name: 'alice',
        },
      },
    });
  });

  it('returns 400 when nip05 batch request is missing ownerPubkey', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/identity/nip05/verify-batch',
      payload: {
        checks: [{ pubkey: PROFILE_PUBKEY, nip05: 'alice@example.com' }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('accepts optional auth proof for profile resolution', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      pubkeys: [PROFILE_PUBKEY],
    };
    const url = '/v1/identity/profiles/resolve';
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}${url}`,
          payload,
        }),
        host: HOST,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profiles: {
        [PROFILE_PUBKEY]: {
          pubkey: PROFILE_PUBKEY,
          createdAt: 1_719_000_100,
          name: 'alice',
        },
      },
    });
  });

  it('does not require owner/auth pubkey match when auth proof is present', async () => {
    const payload = {
      ownerPubkey: OWNER_PUBKEY,
      pubkeys: [PROFILE_PUBKEY],
    };
    const url = '/v1/identity/profiles/resolve';
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OTHER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}${url}`,
          payload,
        }),
        host: HOST,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profiles: {
        [PROFILE_PUBKEY]: {
          pubkey: PROFILE_PUBKEY,
          createdAt: 1_719_000_100,
          name: 'alice',
        },
      },
    });
  });
});
