// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

import { buildApp } from '../../app';
import type { DmService } from './dm.service';

const HOST = 'api.local.test';
const OWNER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x11));
const OTHER_SECRET_KEY = Uint8Array.from(Array.from({ length: 32 }, () => 0x22));
const OWNER_PUBKEY = getPublicKey(OWNER_SECRET_KEY);
const OTHER_PUBKEY = getPublicKey(OTHER_SECRET_KEY);
const PEER_PUBKEY = 'a'.repeat(64);
const EVENT_ID = 'b'.repeat(64);

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

describe('dm routes', () => {
  let streamShouldThrow = false;
  let lastStreamSignal: AbortSignal | undefined;

  const dmService: DmService = {
    getInboxEvents: async () => ({
      items: [
        {
          id: EVENT_ID,
          pubkey: PEER_PUBKEY,
          kind: 1059,
          createdAt: 1_719_000_100,
          content: 'sealed',
          tags: [['p', OWNER_PUBKEY]],
        },
      ],
      hasMore: false,
      nextSince: null,
    }),
    getConversationEvents: async () => ({
      items: [
        {
          id: EVENT_ID,
          pubkey: PEER_PUBKEY,
          kind: 4,
          createdAt: 1_719_000_100,
          content: 'legacy-encrypted',
          tags: [['p', OWNER_PUBKEY]],
        },
      ],
      hasMore: false,
      nextSince: null,
    }),
    streamDmEvents: async function* (_query, signal) {
      lastStreamSignal = signal;

      if (streamShouldThrow) {
        throw new Error('stream failed');
      }

      yield {
        id: EVENT_ID,
        pubkey: PEER_PUBKEY,
        kind: 1059,
        createdAt: 1_719_000_100,
        content: 'sealed',
        tags: [['p', OWNER_PUBKEY]],
      };
    },
  };

  const app = buildApp({ dmService });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns inbox response contract for valid query', async () => {
    const url = `/v1/dm/events/inbox?ownerPubkey=${OWNER_PUBKEY}&limit=20&since=1719000000`;
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
          pubkey: PEER_PUBKEY,
          kind: 1059,
          createdAt: 1_719_000_100,
          content: 'sealed',
          tags: [['p', OWNER_PUBKEY]],
        },
      ],
      hasMore: false,
      nextSince: null,
    });
  });

  it('returns 401 when inbox query is valid but auth proof is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/dm/events/inbox?ownerPubkey=${OWNER_PUBKEY}&limit=20&since=1719000000`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    });
  });

  it('returns 403 when inbox auth pubkey does not match owner', async () => {
    const url = `/v1/dm/events/inbox?ownerPubkey=${OTHER_PUBKEY}&limit=20&since=1719000000`;
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

  it('returns conversation response contract for valid query', async () => {
    const url = `/v1/dm/events/conversation?ownerPubkey=${OWNER_PUBKEY}&peerPubkey=${PEER_PUBKEY}&limit=20&since=1719000000`;
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
          pubkey: PEER_PUBKEY,
          kind: 4,
          createdAt: 1_719_000_100,
          content: 'legacy-encrypted',
          tags: [['p', OWNER_PUBKEY]],
        },
      ],
      hasMore: false,
      nextSince: null,
    });
  });

  it('returns 401 when conversation query is valid but auth proof is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/dm/events/conversation?ownerPubkey=${OWNER_PUBKEY}&peerPubkey=${PEER_PUBKEY}&limit=20&since=1719000000`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    });
  });

  it('returns 403 when conversation auth pubkey does not match owner', async () => {
    const url = `/v1/dm/events/conversation?ownerPubkey=${OTHER_PUBKEY}&peerPubkey=${PEER_PUBKEY}&limit=20&since=1719000000`;
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

  it('returns 200 SSE stream with expected framing', async () => {
    streamShouldThrow = false;
    lastStreamSignal = undefined;

    const url = `/v1/dm/stream?ownerPubkey=${OWNER_PUBKEY}&since=1719000000`;
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
    expect(response.body).toContain('event: dm\n');
    expect(response.body).toContain(`data: {"id":"${EVENT_ID}"`);
    expect(response.body).not.toContain('"type":"dm"');
    expect(response.body).toContain('\n\n');
    expect(lastStreamSignal).toBeDefined();
    expect(lastStreamSignal?.aborted).toBe(true);
  });

  it('accepts dm stream query without since', async () => {
    const url = `/v1/dm/stream?ownerPubkey=${OWNER_PUBKEY}`;
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
  });

  it('returns 401 when stream query is valid but auth proof is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/dm/stream?ownerPubkey=${OWNER_PUBKEY}&since=1719000000`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
      },
    });
  });

  it('returns 403 when stream auth pubkey does not match owner', async () => {
    const url = `/v1/dm/stream?ownerPubkey=${OTHER_PUBKEY}&since=1719000000`;
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

    const url = `/v1/dm/stream?ownerPubkey=${OWNER_PUBKEY}&since=1719000000`;
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
  });
});
