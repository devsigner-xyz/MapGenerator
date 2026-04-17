// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app';

describe('buildApp', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns health status for GET /v1/health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
    });
  });

  it('returns not found for POST /v1/health', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns not found for GET /health without prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(404);
  });
});
