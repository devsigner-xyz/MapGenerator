// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRelayGateway, isRelayGatewayTimeoutError } from './relay-gateway';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe('createRelayGateway', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dedupes concurrent queries for the same key and shares one promise', async () => {
    const deferred = createDeferred<string>();
    const queryFn = vi.fn(async () => deferred.promise);

    const gateway = createRelayGateway({
      queryFn,
      cache: {
        ttlMs: 60_000,
        maxEntries: 100,
      },
    });

    const request = { key: 'social:feed:alice', params: { ownerPubkey: 'alice' } };
    const firstPromise = gateway.query(request);
    const secondPromise = gateway.query(request);

    expect(firstPromise).toBe(secondPromise);
    expect(queryFn).toHaveBeenCalledTimes(1);

    deferred.resolve('ok');

    await expect(firstPromise).resolves.toBe('ok');
    await expect(secondPromise).resolves.toBe('ok');
  });

  it('serves cache hits until TTL expires and then fetches again', async () => {
    let sequence = 0;

    const gateway = createRelayGateway({
      queryFn: vi.fn(async () => ({ sequence: ++sequence })),
      cache: {
        ttlMs: 1_000,
        maxEntries: 10,
      },
    });

    const request = { key: 'social:feed:bob', params: { ownerPubkey: 'bob' } };

    const first = await gateway.query(request);
    const second = await gateway.query(request);

    expect(first).toEqual({ sequence: 1 });
    expect(second).toEqual({ sequence: 1 });

    vi.advanceTimersByTime(1_001);

    const third = await gateway.query(request);
    expect(third).toEqual({ sequence: 2 });
  });

  it('classifies timeout failures as recoverable', async () => {
    const gateway = createRelayGateway({
      queryFn: async () => new Promise<never>(() => undefined),
      defaultTimeoutMs: 25,
      cache: {
        ttlMs: 1_000,
        maxEntries: 10,
      },
    });

    const promise = gateway.query({
      key: 'social:thread:123',
      params: { eventId: '123' },
    });

    vi.advanceTimersByTime(26);

    await expect(promise).rejects.toMatchObject({
      name: 'TimeoutError',
      code: 'ETIMEDOUT',
      recoverable: true,
    });

    await expect(promise).rejects.toSatisfy((error: unknown) => isRelayGatewayTimeoutError(error));
  });

  it('rejects immediately when caller signal is already aborted', async () => {
    const queryFn = vi.fn(async () => 'ok');
    const gateway = createRelayGateway({
      queryFn,
      defaultTimeoutMs: 100,
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      gateway.query({
        key: 'aborted:key',
        params: { value: 1 },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'EABORTED',
      name: 'AbortError',
      recoverable: false,
    });

    expect(queryFn).not.toHaveBeenCalled();
  });
});
