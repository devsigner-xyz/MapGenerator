// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeEvent } from 'nostr-tools';
import { createHash } from 'node:crypto';

import { buildApp } from '../app';
import type { PublishService } from '../modules/publish/publish.service';

describe('rate limit plugin', () => {
  const HOST = 'api.local.test';
  const previousWindow = process.env.BFF_RATE_LIMIT_WINDOW_MS;
  const previousMax = process.env.BFF_RATE_LIMIT_MAX;

  process.env.BFF_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.BFF_RATE_LIMIT_MAX = '2';

  const publishService: PublishService = {
    forward: async () => ({
      ackedRelays: ['wss://relay.damus.io'],
      failedRelays: [],
      timeoutRelays: [],
    }),
  };

  const app = buildApp({ publishService });

  const payload = {
    event: finalizeEvent(
      {
        kind: 1,
        created_at: 1_719_000_000,
        tags: [],
        content: 'rate-limit-test',
      },
      Uint8Array.from(Array.from({ length: 32 }, () => 0x45)),
    ),
    relayScope: 'social' as const,
    relays: ['wss://relay.damus.io'],
  };

  const buildNostrAuthHeader = (method: string, url: string, bodyPayload?: unknown): string => {
    const normalizedMethod = method.toUpperCase();
    const tags: string[][] = [
      ['u', url],
      ['method', normalizedMethod],
      ['nonce', `nonce-${Math.random().toString(16).slice(2, 12)}`],
    ];

    if (bodyPayload !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
      const serializedPayload = JSON.stringify(bodyPayload);
      const payloadHash = createHash('sha256').update(serializedPayload).digest('hex');
      tags.push(['payload', payloadHash]);
    }

    const authEvent = finalizeEvent(
      {
        kind: 27_235,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: '',
      },
      Uint8Array.from(Array.from({ length: 32 }, () => 0x45)),
    );

    return `Nostr ${Buffer.from(JSON.stringify(authEvent)).toString('base64')}`;
  };

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();

    if (previousWindow === undefined) {
      delete process.env.BFF_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.BFF_RATE_LIMIT_WINDOW_MS = previousWindow;
    }

    if (previousMax === undefined) {
      delete process.env.BFF_RATE_LIMIT_MAX;
    } else {
      process.env.BFF_RATE_LIMIT_MAX = previousMax;
    }
  });

  it('returns 429 with retry-after when rate limit is exceeded', async () => {
    await app.inject({ method: 'GET', url: '/v1/health', remoteAddress: '1.2.3.4' });
    await app.inject({ method: 'GET', url: '/v1/health', remoteAddress: '1.2.3.4' });

    const limited = await app.inject({
      method: 'GET',
      url: '/v1/health',
      remoteAddress: '1.2.3.4',
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.json()).toMatchObject({
      error: {
        code: 'RATE_LIMITED',
      },
    });
  });

  it('uses route-specific rate limit overrides when configured', async () => {
    const url = '/v1/publish/forward';

    const first = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '5.6.7.8',
      payload,
      headers: {
        authorization: buildNostrAuthHeader('POST', `http://${HOST}${url}`, payload),
        host: HOST,
      },
    });
    const second = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '5.6.7.8',
      payload,
      headers: {
        authorization: buildNostrAuthHeader('POST', `http://${HOST}${url}`, payload),
        host: HOST,
      },
    });
    const third = await app.inject({
      method: 'POST',
      url,
      remoteAddress: '5.6.7.8',
      payload,
      headers: {
        authorization: buildNostrAuthHeader('POST', `http://${HOST}${url}`, payload),
        host: HOST,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(200);
  });
});
