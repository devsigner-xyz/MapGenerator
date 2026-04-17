// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app';

describe('cors plugin', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows configured origin and sets CORS headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: {
        origin: 'http://localhost:5173',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers.vary).toBe('Origin');
  });

  it('rejects disallowed origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: {
        origin: 'https://not-allowed.example',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN_ORIGIN',
      },
    });
  });
});
