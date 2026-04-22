const MIN_FOLLOW_DRIVEN_BUILDINGS = 600;
const MAX_FOLLOW_DRIVEN_BUILDINGS = 10000;

function normalizeFollowEntries(follows: string[]): string[] {
    return follows
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
}

export function buildFollowDrivenTargetBuildings(input: { follows: string[] }): number {
    const followedResidentCount = new Set(normalizeFollowEntries(input.follows)).size;
    const systemBuffer = 8;
    const emptyHeadroom = Math.max(6, Math.ceil(followedResidentCount * 0.15));
    return Math.min(
        MAX_FOLLOW_DRIVEN_BUILDINGS,
        Math.max(MIN_FOLLOW_DRIVEN_BUILDINGS, followedResidentCount + systemBuffer + emptyHeadroom),
    );
}
