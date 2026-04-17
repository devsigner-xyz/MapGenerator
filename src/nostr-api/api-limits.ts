export const API_MIN_LIMIT = 1;
export const API_MAX_LIMIT = 100;

export function clampApiLimit(limit: number): number {
    if (!Number.isFinite(limit)) {
        return API_MAX_LIMIT;
    }

    const normalized = Math.floor(limit);
    if (normalized < API_MIN_LIMIT) {
        return API_MIN_LIMIT;
    }

    if (normalized > API_MAX_LIMIT) {
        return API_MAX_LIMIT;
    }

    return normalized;
}
