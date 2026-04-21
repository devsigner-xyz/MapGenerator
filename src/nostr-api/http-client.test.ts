import { afterEach, describe, expect, test, vi } from 'vitest';
import { createHttpClient, HttpClientError } from './http-client';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('createHttpClient', () => {
    test('parses successful JSON response', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => {
            return new Response(JSON.stringify({ ok: true, value: 7 }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = createHttpClient({
            baseUrl: 'https://bff.example/v1',
        });

        const response = await client.getJson<{ ok: boolean; value: number }>('/social/ping');

        expect(response).toEqual({ ok: true, value: 7 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://bff.example/v1/social/ping');
    });

    test('serializes array query values as repeated query params', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => {
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = createHttpClient({
            baseUrl: 'https://bff.example/v1',
        });

        await client.getJson('/users/search', {
            query: {
                ownerPubkey: 'a'.repeat(64),
                q: 'alice',
                searchRelays: ['wss://search.nos.today', 'wss://relay.noswhere.com'],
            },
        });

        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            'https://bff.example/v1/users/search?ownerPubkey='
            + `${'a'.repeat(64)}`
            + '&q=alice'
            + '&searchRelays=wss%3A%2F%2Fsearch.nos.today'
            + '&searchRelays=wss%3A%2F%2Frelay.noswhere.com'
        );
    });

    test('normalizes backend error envelope for non-2xx responses', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => {
            return new Response(JSON.stringify({
                error: {
                    code: 'OWNER_AUTH_INVALID',
                    message: 'Missing or invalid Nostr auth proof',
                    requestId: 'req-123',
                    details: [{ path: '/ownerPubkey', message: 'required' }],
                },
            }), {
                status: 401,
                headers: {
                    'content-type': 'application/json',
                },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = createHttpClient({
            baseUrl: 'https://bff.example/v1',
        });

        await expect(client.getJson('/notifications', {
            query: {
                ownerPubkey: 'a'.repeat(64),
                limit: 20,
                since: 1,
            },
            includeAuth: true,
        })).rejects.toBeInstanceOf(HttpClientError);

        await expect(client.getJson('/notifications', {
            query: {
                ownerPubkey: 'a'.repeat(64),
                limit: 20,
                since: 1,
            },
            includeAuth: true,
        })).rejects.toMatchObject({
            status: 401,
            code: 'OWNER_AUTH_INVALID',
            message: 'Missing or invalid Nostr auth proof',
            requestId: 'req-123',
            details: [{ path: '/ownerPubkey', message: 'required' }],
        });
    });

    test('captures retry-after header for rate-limited responses', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => {
            return new Response(JSON.stringify({
                error: {
                    code: 'RATE_LIMITED',
                    message: 'Rate limit exceeded',
                },
            }), {
                status: 429,
                headers: {
                    'content-type': 'application/json',
                    'retry-after': '17',
                },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = createHttpClient({
            baseUrl: 'https://bff.example/v1',
        });

        await expect(client.getJson('/social/feed/following')).rejects.toMatchObject({
            status: 429,
            code: 'RATE_LIMITED',
            retryAfterSeconds: 17,
        });
    });

    test('throws normalized timeout error when request exceeds timeout', async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
            const signal = init?.signal;
            return new Promise<Response>((_resolve, reject) => {
                if (!signal) {
                    return;
                }

                signal.addEventListener('abort', () => {
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                }, { once: true });
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = createHttpClient({
            baseUrl: 'https://bff.example/v1',
        });

        const promise = client.getJson('/dm/stream', {
            timeoutMs: 25,
        });

        const assertion = expect(promise).rejects.toMatchObject({
            status: 408,
            code: 'TIMEOUT',
            isTimeout: true,
        });

        await vi.advanceTimersByTimeAsync(50);

        await assertion;
    });

    test('distinguishes caller abort from timeout', async () => {
        const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
            const signal = init?.signal;
            return new Promise<Response>((_resolve, reject) => {
                if (!signal) {
                    return;
                }

                signal.addEventListener('abort', () => {
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                }, { once: true });
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = createHttpClient({
            baseUrl: 'https://bff.example/v1',
            timeoutMs: 5_000,
        });

        const abortController = new AbortController();
        const promise = client.getJson('/notifications', {
            signal: abortController.signal,
        });

        abortController.abort();

        await expect(promise).rejects.toMatchObject({
            status: 499,
            code: 'ABORTED',
            isTimeout: false,
        });
    });
});
