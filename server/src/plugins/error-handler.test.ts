// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app';

describe('error handler plugin', () => {
  const app = buildApp();

  beforeAll(async () => {
    app.post(
      '/v1/test/validation',
      {
        schema: {
          body: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string', minLength: 1 },
            },
          },
        },
      },
      async () => {
        return { ok: true };
      },
    );

    app.get('/v1/test/error', async () => {
      throw new Error('boom');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps validation errors to the unified envelope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/test/validation',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('maps unexpected errors to internal server envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/test/error',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
      },
    });
  });
});
