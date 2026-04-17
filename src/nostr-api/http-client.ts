type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: unknown };

type QueryValue = string | number | boolean | null | undefined;

interface BackendErrorEnvelope {
    error: {
        code: string;
        message: string;
        requestId?: string;
        details?: unknown;
    };
}

interface NormalizedBackendError {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
}

export interface HttpClientErrorOptions {
    status: number;
    code: string;
    message: string;
    method: string;
    url: string;
    requestId?: string;
    details?: unknown;
    cause?: unknown;
    isTimeout?: boolean;
    retryAfterSeconds?: number;
}

export class HttpClientError extends Error {
    readonly status: number;
    readonly code: string;
    readonly method: string;
    readonly url: string;
    readonly requestId?: string;
    readonly details?: unknown;
    readonly isTimeout: boolean;
    readonly retryAfterSeconds?: number;

    constructor(options: HttpClientErrorOptions) {
        super(options.message);
        this.name = 'HttpClientError';
        this.status = options.status;
        this.code = options.code;
        this.method = options.method;
        this.url = options.url;
        this.requestId = options.requestId;
        this.details = options.details;
        this.isTimeout = Boolean(options.isTimeout);
        this.retryAfterSeconds = options.retryAfterSeconds;

        if (options.cause !== undefined) {
            (this as Error & { cause?: unknown }).cause = options.cause;
        }
    }
}

type MaybePromise<T> = T | Promise<T>;

export interface HttpClientAuthContext {
    method: string;
    path: string;
    url: string;
    query?: Record<string, QueryValue>;
    body?: unknown;
}

export interface HttpClientConfig {
    baseUrl?: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
    getAuthHeaders?: (context: HttpClientAuthContext) => MaybePromise<Record<string, string> | undefined>;
}

export interface HttpRequestOptions {
    query?: Record<string, QueryValue>;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
    includeAuth?: boolean;
}

export interface HttpClient {
    requestRaw(method: string, path: string, options?: HttpRequestOptions): Promise<Response>;
    requestJson<T>(method: string, path: string, options?: HttpRequestOptions): Promise<T>;
    getJson<T>(path: string, options?: Omit<HttpRequestOptions, 'body'>): Promise<T>;
    postJson<T>(path: string, options?: HttpRequestOptions): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeBaseUrl(baseUrl: string): string {
    const normalized = baseUrl.trim();
    if (!normalized) {
        return '/v1';
    }

    if (normalized === '/') {
        return '';
    }

    return normalized.replace(/\/+$/, '');
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const absolutePath = /^https?:\/\//i.test(path)
        ? path
        : `${baseUrl}${normalizedPath}`;

    const params = new URLSearchParams();
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null) {
                continue;
            }

            params.set(key, String(value));
        }
    }

    const queryString = params.toString();
    return queryString.length > 0 ? `${absolutePath}?${queryString}` : absolutePath;
}

function isBackendErrorEnvelope(value: unknown): value is BackendErrorEnvelope {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const errorContainer = (value as { error?: unknown }).error;
    if (!errorContainer || typeof errorContainer !== 'object') {
        return false;
    }

    const code = (errorContainer as { code?: unknown }).code;
    const message = (errorContainer as { message?: unknown }).message;
    return typeof code === 'string' && code.length > 0 && typeof message === 'string' && message.length > 0;
}

function normalizeStatusCodeError(status: number): string {
    switch (status) {
        case 400:
            return 'BAD_REQUEST';
        case 401:
            return 'UNAUTHORIZED';
        case 403:
            return 'FORBIDDEN';
        case 404:
            return 'NOT_FOUND';
        case 409:
            return 'CONFLICT';
        case 429:
            return 'RATE_LIMITED';
        default:
            return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR';
    }
}

function normalizeErrorEnvelope(response: Response, payload: unknown): NormalizedBackendError {
    if (isBackendErrorEnvelope(payload)) {
        return {
            code: payload.error.code,
            message: payload.error.message,
            requestId: payload.error.requestId,
            details: payload.error.details,
        };
    }

    if (payload && typeof payload === 'object') {
        const message = (payload as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return {
                code: normalizeStatusCodeError(response.status),
                message,
            };
        }
    }

    return {
        code: normalizeStatusCodeError(response.status),
        message: response.statusText || `Request failed with status ${response.status}`,
    };
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
    if (!value) {
        return undefined;
    }

    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return undefined;
    }

    return numeric;
}

async function parseJsonBody(response: Response): Promise<unknown> {
    const raw = await response.text();
    if (!raw || raw.trim().length === 0) {
        return undefined;
    }

    return JSON.parse(raw);
}

function toAbortError(method: string, url: string, timeoutMs: number): HttpClientError {
    return new HttpClientError({
        status: 408,
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms`,
        method,
        url,
        isTimeout: true,
    });
}

function toRequestAbortedError(method: string, url: string): HttpClientError {
    return new HttpClientError({
        status: 499,
        code: 'ABORTED',
        message: 'Request was aborted by caller',
        method,
        url,
    });
}

export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
    const fetchImpl = config.fetch ?? fetch;
    const baseUrl = normalizeBaseUrl(config.baseUrl ?? '/v1');
    const defaultTimeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const requestRaw = async (
        method: string,
        path: string,
        options: HttpRequestOptions = {},
    ): Promise<Response> => {
        const upperMethod = method.toUpperCase();
        const url = buildUrl(baseUrl, path, options.query);
        const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
        const controller = new AbortController();

        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let didTimeout = false;
        let onAbort: (() => void) | null = null;

        if (options.signal) {
            if (options.signal.aborted) {
                controller.abort(options.signal.reason);
            } else {
                onAbort = () => controller.abort(options.signal?.reason);
                options.signal.addEventListener('abort', onAbort, { once: true });
            }
        }

        if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
            timeoutId = setTimeout(() => {
                didTimeout = true;
                controller.abort();
            }, timeoutMs);
        }

        const headers: Record<string, string> = {
            accept: 'application/json',
            ...options.headers,
        };

        if (options.body !== undefined && !Object.prototype.hasOwnProperty.call(headers, 'content-type')) {
            headers['content-type'] = 'application/json';
        }

        if (options.includeAuth && config.getAuthHeaders) {
            const authHeaders = await config.getAuthHeaders({
                method: upperMethod,
                path,
                url,
                query: options.query,
                body: options.body,
            });

            if (authHeaders) {
                Object.assign(headers, authHeaders);
            }
        }

        try {
            const response = await fetchImpl(url, {
                method: upperMethod,
                headers,
                body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });

            if (response.ok) {
                return response;
            }

            let payload: unknown;
            try {
                payload = await parseJsonBody(response);
            } catch {
                payload = undefined;
            }

            const normalizedError = normalizeErrorEnvelope(response, payload);
            throw new HttpClientError({
                status: response.status,
                code: normalizedError.code,
                message: normalizedError.message,
                method: upperMethod,
                url,
                requestId: normalizedError.requestId,
                details: normalizedError.details,
                retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
            });
        } catch (error) {
            if (error instanceof HttpClientError) {
                throw error;
            }

            if (didTimeout) {
                throw toAbortError(upperMethod, url, timeoutMs);
            }

            if (error instanceof DOMException && error.name === 'AbortError') {
                if (options.signal?.aborted) {
                    throw toRequestAbortedError(upperMethod, url);
                }

                throw toAbortError(upperMethod, url, timeoutMs);
            }

            throw new HttpClientError({
                status: 0,
                code: 'NETWORK_ERROR',
                message: error instanceof Error ? error.message : 'Network request failed',
                method: upperMethod,
                url,
                cause: error,
            });
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (options.signal && onAbort) {
                options.signal.removeEventListener('abort', onAbort);
            }
        }
    };

    const requestJson = async <T>(
        method: string,
        path: string,
        options: HttpRequestOptions = {},
    ): Promise<T> => {
        const response = await requestRaw(method, path, options);

        if (response.status === 204) {
            return undefined as T;
        }

        try {
            return await parseJsonBody(response) as T;
        } catch (error) {
            throw new HttpClientError({
                status: response.status,
                code: 'INVALID_JSON_RESPONSE',
                message: 'Response body is not valid JSON',
                method: method.toUpperCase(),
                url: response.url,
                cause: error,
            });
        }
    };

    return {
        requestRaw,
        requestJson,
        getJson: <T>(path: string, options: Omit<HttpRequestOptions, 'body'> = {}) => {
            return requestJson<T>('GET', path, options);
        },
        postJson: <T>(path: string, options: HttpRequestOptions = {}) => {
            return requestJson<T>('POST', path, options);
        },
    };
}
