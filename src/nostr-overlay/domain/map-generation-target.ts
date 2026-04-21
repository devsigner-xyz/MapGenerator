function normalizeFollowEntries(follows: string[]): string[] {
    return follows
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
}

export function buildFollowDrivenTargetBuildings(input: { follows: string[] }): number {
    const followedResidentCount = new Set(normalizeFollowEntries(input.follows)).size;
    const systemBuffer = 8;
    const emptyHeadroom = Math.max(6, Math.ceil(followedResidentCount * 0.15));
    return Math.max(600, followedResidentCount + systemBuffer + emptyHeadroom);
}
