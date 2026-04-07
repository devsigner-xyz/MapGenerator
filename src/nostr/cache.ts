interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export interface TtlCacheOptions {
    ttlMs: number;
    maxEntries?: number;
}

export interface TtlCache<T> {
    get: (key: string) => T | undefined;
    set: (key: string, value: T) => void;
    getOrLoad: (key: string, loader: () => Promise<T>) => Promise<T>;
    clear: () => void;
}

export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
    const ttlMs = Math.max(1, Math.floor(options.ttlMs));
    const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? Number.POSITIVE_INFINITY));
    const entries = new Map<string, CacheEntry<T>>();
    const inFlight = new Map<string, Promise<T>>();

    const get = (key: string): T | undefined => {
        const existing = entries.get(key);
        if (!existing) {
            return undefined;
        }

        if (existing.expiresAt <= Date.now()) {
            entries.delete(key);
            return undefined;
        }

        return existing.value;
    };

    const evictOverflow = (): void => {
        while (entries.size > maxEntries) {
            const oldestKey = entries.keys().next().value as string | undefined;
            if (!oldestKey) {
                return;
            }
            entries.delete(oldestKey);
        }
    };

    const set = (key: string, value: T): void => {
        entries.delete(key);
        entries.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
        evictOverflow();
    };

    const getOrLoad = async (key: string, loader: () => Promise<T>): Promise<T> => {
        const cached = get(key);
        if (cached !== undefined) {
            return cached;
        }

        const ongoing = inFlight.get(key);
        if (ongoing) {
            return ongoing;
        }

        const loadingPromise = loader()
            .then((value) => {
                set(key, value);
                inFlight.delete(key);
                return value;
            })
            .catch((error) => {
                inFlight.delete(key);
                throw error;
            });

        inFlight.set(key, loadingPromise);
        return loadingPromise;
    };

    const clear = (): void => {
        entries.clear();
        inFlight.clear();
    };

    return {
        get,
        set,
        getOrLoad,
        clear,
    };
}
