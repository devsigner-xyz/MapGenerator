interface Nip05JsonResponse {
    names?: Record<string, string>;
}

interface CacheEntry {
    result: Nip05ValidationResult;
    expiresAt: number;
}

export interface ParsedNip05Identifier {
    name: string;
    domain: string;
    normalized: string;
    display: string;
}

export type Nip05ValidationStatus = 'verified' | 'unverified' | 'error';

export interface Nip05ValidationResult {
    status: Nip05ValidationStatus;
    identifier: string;
    displayIdentifier?: string;
    resolvedPubkey?: string;
    error?: string;
    checkedAt: number;
}

export interface ValidateNip05Input {
    pubkey: string;
    nip05?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

const SUCCESS_TTL_MS = 15 * 60_000;
const ERROR_TTL_MS = 3 * 60_000;
const DEFAULT_TIMEOUT_MS = 3_500;
const MAX_CACHE_ENTRIES = 5_000;

const successAndUnverifiedCache = new Map<string, CacheEntry>();
const errorCache = new Map<string, CacheEntry>();
const inFlightValidations = new Map<string, Promise<Nip05ValidationResult>>();

function getFromCache(cache: Map<string, CacheEntry>, key: string): Nip05ValidationResult | undefined {
    const cached = cache.get(key);
    if (!cached) {
        return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
        cache.delete(key);
        return undefined;
    }

    return cached.result;
}

function setInCache(cache: Map<string, CacheEntry>, key: string, result: Nip05ValidationResult, ttlMs: number): void {
    cache.delete(key);
    cache.set(key, {
        result,
        expiresAt: Date.now() + ttlMs,
    });

    while (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value as string | undefined;
        if (!oldestKey) {
            break;
        }
        cache.delete(oldestKey);
    }
}

function normalizePubkey(value: string): string {
    return value.trim().toLowerCase();
}

function getCacheKey(pubkey: string, normalizedIdentifier: string): string {
    return `${normalizePubkey(pubkey)}::${normalizedIdentifier}`;
}

function lookupNameIgnoreCase(names: Record<string, string>, expectedName: string): string | undefined {
    const expected = expectedName.toLowerCase();
    for (const [key, value] of Object.entries(names)) {
        if (key.toLowerCase() === expected) {
            return value;
        }
    }

    return undefined;
}

function parseResponse(value: unknown): Nip05JsonResponse {
    if (!value || typeof value !== 'object') {
        return {};
    }

    return value as Nip05JsonResponse;
}

function resolveTimeoutMs(timeoutMs?: number): number {
    if (!Number.isFinite(timeoutMs)) {
        return DEFAULT_TIMEOUT_MS;
    }

    return Math.max(250, Math.round(timeoutMs as number));
}

function buildResult(input: {
    status: Nip05ValidationStatus;
    parsed: ParsedNip05Identifier | null;
    rawIdentifier?: string;
    resolvedPubkey?: string;
    error?: string;
}): Nip05ValidationResult {
    return {
        status: input.status,
        identifier: input.parsed?.normalized || input.rawIdentifier || '',
        displayIdentifier: input.parsed?.display,
        resolvedPubkey: input.resolvedPubkey,
        error: input.error,
        checkedAt: Date.now(),
    };
}

export function parseNip05Identifier(value: string | undefined): ParsedNip05Identifier | null {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) {
        return null;
    }

    const pieces = raw.split('@');
    if (pieces.length !== 2) {
        return null;
    }

    const rawName = pieces[0]?.trim();
    const rawDomain = pieces[1]?.trim().toLowerCase();
    if (!rawName || !rawDomain) {
        return null;
    }

    if (!/^[a-z0-9._-]+$/i.test(rawName)) {
        return null;
    }

    if (!/^[a-z0-9.-]+$/i.test(rawDomain) || !rawDomain.includes('.')) {
        return null;
    }

    const name = rawName.toLowerCase();
    const normalized = `${name}@${rawDomain}`;

    return {
        name,
        domain: rawDomain,
        normalized,
        display: name === '_' ? rawDomain : normalized,
    };
}

export function getNip05DisplayIdentifier(value: string | undefined): string | undefined {
    return parseNip05Identifier(value)?.display;
}

export async function validateNip05Identifier(input: ValidateNip05Input): Promise<Nip05ValidationResult> {
    const parsed = parseNip05Identifier(input.nip05);
    if (!parsed) {
        return buildResult({
            status: 'unverified',
            parsed: null,
            rawIdentifier: input.nip05,
        });
    }

    const cacheKey = getCacheKey(input.pubkey, parsed.normalized);
    const cachedSuccess = getFromCache(successAndUnverifiedCache, cacheKey);
    if (cachedSuccess) {
        return cachedSuccess;
    }

    const cachedError = getFromCache(errorCache, cacheKey);
    if (cachedError) {
        return cachedError;
    }

    const ongoing = inFlightValidations.get(cacheKey);
    if (ongoing) {
        return ongoing;
    }

    const timeoutMs = resolveTimeoutMs(input.timeoutMs);
    const fetchImpl = input.fetchImpl || fetch;
    const expectedPubkey = normalizePubkey(input.pubkey);

    const promise = (async (): Promise<Nip05ValidationResult> => {
        const controller = new AbortController();
        const timer = globalThis.setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        try {
            const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.name)}`;
            const response = await fetchImpl(url, {
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const parsedBody = parseResponse(await response.json());
            const names = parsedBody.names;
            if (!names || typeof names !== 'object') {
                const result = buildResult({
                    status: 'unverified',
                    parsed,
                });
                setInCache(successAndUnverifiedCache, cacheKey, result, SUCCESS_TTL_MS);
                return result;
            }

            const resolved = lookupNameIgnoreCase(names, parsed.name);
            if (typeof resolved !== 'string' || !resolved.trim()) {
                const result = buildResult({
                    status: 'unverified',
                    parsed,
                });
                setInCache(successAndUnverifiedCache, cacheKey, result, SUCCESS_TTL_MS);
                return result;
            }

            const normalizedResolved = normalizePubkey(resolved);
            const result = buildResult({
                status: normalizedResolved === expectedPubkey ? 'verified' : 'unverified',
                parsed,
                resolvedPubkey: normalizedResolved,
            });
            setInCache(successAndUnverifiedCache, cacheKey, result, SUCCESS_TTL_MS);
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'NIP-05 request failed';
            const result = buildResult({
                status: 'error',
                parsed,
                error: message,
            });
            setInCache(errorCache, cacheKey, result, ERROR_TTL_MS);
            return result;
        } finally {
            globalThis.clearTimeout(timer);
            inFlightValidations.delete(cacheKey);
        }
    })();

    inFlightValidations.set(cacheKey, promise);
    return promise;
}

export function __resetNip05ValidationCacheForTests(): void {
    successAndUnverifiedCache.clear();
    errorCache.clear();
    inFlightValidations.clear();
}
