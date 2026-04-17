// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { createHash } from 'node:crypto';

import { buildApp } from '../app';

const hexToBytes = (hex: string): Uint8Array => {
  const pairs = hex.match(/.{1,2}/g);
  if (!pairs) {
    return new Uint8Array();
  }

  return Uint8Array.from(pairs.map((pair) => Number.parseInt(pair, 16)));
};

const OWNER_SECRET_KEY = hexToBytes('11'.repeat(32));
const OTHER_SECRET_KEY = hexToBytes('22'.repeat(32));
const OWNER_PUBKEY = getPublicKey(OWNER_SECRET_KEY);
const OTHER_PUBKEY = getPublicKey(OTHER_SECRET_KEY);
const HOST = 'api.local.test';

const hashPayload = (payload: unknown): string => {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

const buildNostrAuthHeader = ({
  secretKey,
  method,
  url,
  payload,
  createdAt,
  includeNonce,
}: {
  secretKey: Uint8Array;
  method: string;
  url: string;
  payload?: unknown;
  createdAt?: number;
  includeNonce?: boolean;
}): string => {
  const nonce = `nonce-${Math.random().toString(16).slice(2, 12)}`;
  const normalizedMethod = method.toUpperCase();
  const tags: string[][] = [
    ['u', url],
    ['method', normalizedMethod],
  ];

  if (includeNonce !== false) {
    tags.push(['nonce', nonce]);
  }

  if (payload !== undefined && payload !== null) {
    tags.push(['payload', hashPayload(payload)]);
  }

  const event = finalizeEvent(
    {
      kind: 27_235,
      created_at: createdAt ?? Math.floor(Date.now() / 1000),
      tags,
      content: '',
    },
    secretKey,
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
};

const tamperAuthHeaderSignature = (header: string): string => {
  const proof = header.slice('Nostr '.length);
  const decoded = Buffer.from(proof, 'base64').toString('utf8');
  const event = JSON.parse(decoded) as { sig: string };

  event.sig = `${event.sig.slice(0, 127)}${event.sig[127] === '0' ? '1' : '0'}`;
  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
};

describe('owner auth plugin', () => {
  const app = buildApp();

  beforeAll(async () => {
    app.register(async (instance) => {
      instance.post<{
        Body: {
          ownerPubkey: string;
        };
      }>(
        '/v1/test/owner-auth',
        {
          preHandler: instance.verifyOwnerAuth,
        },
        async (request) => {
          const context = request.context as {
            requestId: string;
            authenticatedPubkey?: string;
          };

          return {
            ok: true,
            authenticatedPubkey: context.authenticatedPubkey,
          };
        },
      );
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 when auth proof is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    });
  });

  it('returns 403 when valid proof pubkey differs from ownerPubkey', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/test/owner-auth`,
          payload: {
            ownerPubkey: OTHER_PUBKEY,
          },
        }),
        host: HOST,
      },
      payload: {
        ownerPubkey: OTHER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN',
      },
    });
  });

  it('returns 200 when proof pubkey matches ownerPubkey', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/test/owner-auth`,
          payload: {
            ownerPubkey: OWNER_PUBKEY,
          },
        }),
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      authenticatedPubkey: OWNER_PUBKEY,
    });
  });

  it('returns 401 for expired auth event timestamp', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/test/owner-auth`,
          payload: {
            ownerPubkey: OWNER_PUBKEY,
          },
          createdAt: Math.floor(Date.now() / 1000) - 600,
        }),
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for auth proof with method mismatch', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'GET',
          url: `http://${HOST}/v1/test/owner-auth`,
          payload: {
            ownerPubkey: OWNER_PUBKEY,
          },
        }),
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for auth proof with relative URL tag', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: '/v1/test/owner-auth',
          payload: {
            ownerPubkey: OWNER_PUBKEY,
          },
        }),
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for auth proof with invalid signature', async () => {
    const validHeader = buildNostrAuthHeader({
      secretKey: OWNER_SECRET_KEY,
      method: 'POST',
      url: `http://${HOST}/v1/test/owner-auth`,
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: tamperAuthHeaderSignature(validHeader),
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when payload hash does not match request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/test/owner-auth`,
          payload: {
            ownerPubkey: OWNER_PUBKEY,
          },
        }),
        host: HOST,
      },
      payload: {
        ownerPubkey: OTHER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when nonce tag is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `http://${HOST}/v1/test/owner-auth`,
          payload: {
            ownerPubkey: OWNER_PUBKEY,
          },
          includeNonce: false,
        }),
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for auth proof with absolute URL mismatch', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: 'http://other-host.local/v1/test/owner-auth',
          payload: {
            ownerPubkey: OWNER_PUBKEY,
          },
        }),
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('accepts auth proof URL using forwarded host/proto headers', async () => {
    const publicHost = 'public.example.com';
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: buildNostrAuthHeader({
          secretKey: OWNER_SECRET_KEY,
          method: 'POST',
          url: `https://${publicHost}/v1/test/owner-auth`,
          payload: {
            ownerPubkey: OWNER_PUBKEY,
          },
        }),
        host: 'internal.service.local',
        'x-forwarded-host': publicHost,
        'x-forwarded-proto': 'https',
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns 401 when reusing the same signed auth proof', async () => {
    const authHeader = buildNostrAuthHeader({
      secretKey: OWNER_SECRET_KEY,
      method: 'POST',
      url: `http://${HOST}/v1/test/owner-auth`,
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: authHeader,
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    const second = await app.inject({
      method: 'POST',
      url: '/v1/test/owner-auth',
      headers: {
        authorization: authHeader,
        host: HOST,
      },
      payload: {
        ownerPubkey: OWNER_PUBKEY,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
  });
});
