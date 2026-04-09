export function createStreetLabelSeed(randomFn: () => number = Math.random): string {
    return Math.floor(randomFn() * 1_000_000_000).toString(36);
}

export function nextStreetLabelSeed(
    currentSeed?: string,
    refresh: boolean = false,
    randomFn: () => number = Math.random,
): string {
    if (!refresh && currentSeed) {
        return currentSeed;
    }

    return createStreetLabelSeed(randomFn);
}
