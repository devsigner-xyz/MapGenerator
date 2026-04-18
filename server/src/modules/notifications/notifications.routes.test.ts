// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

import { buildApp } from '../../app';
import type { NotificationsService } from './notifications.service';

const HOST = 'api.local.test';
const OWNER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x11));
const OTHER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x22));
const OWNER_PUBKEY = getPublicKey(OWNER_SECRET_KEY);
const OTHER_PUBKEY = getPublicKey(OTHER_SECRET_KEY);
const ACTOR_PUBKEY = 'a'.repeat(64);
const EVENT_ID = 'b'.repeat(64);
const TARGET_EVENT_ID = 'c'.repeat(64);

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

describe('notifications routes', () => {
  let streamShouldThrow = false;
  let lastStreamSignal: AbortSignal | undefined;

  const notificationsService: NotificationsService = {
    getNotifications: async () => ({
      items: [
        {
          id: EVENT_ID,
          kind: 1,
          actorPubkey: ACTOR_PUBKEY,
          createdAt: 1_719_000_100,
          targetEventId: TARGET_EVENT_ID,
          targetPubkey: OWNER_PUBKEY,
          rawEvent: {
            id: EVENT_ID,
            pubkey: ACTOR_PUBKEY,
            kind: 1,
            createdAt: 1_719_000_100,
            content: 'mention',
            tags: [
              ['p', OWNER_PUBKEY],
              ['e', TARGET_EVENT_ID],
            ],
          },
        },
      ],
      hasMore: false,
      nextSince: null,
    }),
    streamNotifications: async function* (_query, signal) {
      lastStreamSignal = signal;

      if (streamShouldThrow) {
        throw new Error('stream failed');
      }

      yield {
        id: EVENT_ID,
        kind: 1,
        actorPubkey: ACTOR_PUBKEY,
        createdAt: 1_719_000_100,
        targetEventId: TARGET_EVENT_ID,
        targetPubkey: OWNER_PUBKEY,
        rawEvent: {
          id: EVENT_ID,
          pubkey: ACTOR_PUBKEY,
          kind: 1,
          createdAt: 1_719_000_100,
          content: 'mention',
          tags: [
            ['p', OWNER_PUBKEY],
            ['e', TARGET_EVENT_ID],
          ],
        },
      };
    },
  };
  const app = buildApp({ notificationsService });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns notifications list contract for valid query', async () => {
    const url = `/v1/notifications?ownerPubkey=${OWNER_PUBKEY}&limit=20&since=1719000000`;
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
      items: [
        {
          id: EVENT_ID,
          kind: 1,
          actorPubkey: ACTOR_PUBKEY,
          createdAt: 1_719_000_100,
          targetEventId: TARGET_EVENT_ID,
          targetPubkey: OWNER_PUBKEY,
          rawEvent: {
            id: EVENT_ID,
            pubkey: ACTOR_PUBKEY,
            kind: 1,
            createdAt: 1_719_000_100,
            content: 'mention',
            tags: [
              ['p', OWNER_PUBKEY],
              ['e', TARGET_EVENT_ID],
            ],
          },
        },
      ],
      hasMore: false,
      nextSince: null,
    });
  });

  it('returns 401 when notifications list query is valid but auth proof is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/notifications?ownerPubkey=${OWNER_PUBKEY}&limit=20&since=1719000000`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    });
  });

  it('returns 403 when notifications list auth pubkey does not match owner', async () => {
    const url = `/v1/notifications?ownerPubkey=${OTHER_PUBKEY}&limit=20&since=1719000000`;
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

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN',
      },
    });
  });

  it('returns 400 when notifications query is missing ownerPubkey', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/notifications?limit=20&since=1719000000',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when notifications query has invalid limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/notifications?ownerPubkey=${OWNER_PUBKEY}&limit=0&since=1719000000`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when notifications query limit exceeds max bound', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/notifications?ownerPubkey=${OWNER_PUBKEY}&limit=101&since=1719000000`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 400 when notifications query has invalid since', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/notifications?ownerPubkey=${OWNER_PUBKEY}&limit=20&since=-1`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns 200 SSE stream with expected framing', async () => {
    streamShouldThrow = false;
    lastStreamSignal = undefined;

    const url = `/v1/notifications/stream?ownerPubkey=${OWNER_PUBKEY}&since=1719000000`;
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
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain(': connected\n\n');
    expect(response.body).toContain(`id: ${EVENT_ID}\n`);
    expect(response.body).toContain('event: notification\n');
    expect(response.body).toContain('data: {');
    expect(response.body).toContain('\n\n');
    expect(lastStreamSignal).toBeDefined();
    expect((lastStreamSignal as AbortSignal | undefined)?.aborted).toBe(true);
  });

  it('returns 401 when notifications stream query is valid but auth proof is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/notifications/stream?ownerPubkey=${OWNER_PUBKEY}&since=1719000000`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    });
  });

  it('returns 403 when notifications stream auth pubkey does not match owner', async () => {
    const url = `/v1/notifications/stream?ownerPubkey=${OTHER_PUBKEY}&since=1719000000`;
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

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN',
      },
    });
  });

  it('emits SSE error frame and closes stream when streaming fails', async () => {
    streamShouldThrow = true;

    const url = `/v1/notifications/stream?ownerPubkey=${OWNER_PUBKEY}&since=1719000000`;
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
    expect(response.body).toContain(': connected\n\n');
    expect(response.body).toContain('event: error\n');
    expect(response.body).toContain('data: {"type":"error","message":"stream failed"}\n\n');
    streamShouldThrow = false;
  });
});
