import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';

export interface CityStatsInput {
    buildingsCount: number;
    occupiedBuildingsCount: number;
    followedPubkeys: string[];
    followerPubkeys: string[];
    profilesByPubkey: Record<string, NostrProfile>;
    verificationByPubkey: Record<string, Nip05ValidationResult | undefined>;
    parkCount: number;
}

interface CityHousingStats {
    total: number;
    occupied: number;
    available: number;
    occupancyRate: number;
}

interface CitySocialStats {
    following: number;
    followers: number;
    mutualFollows: number;
    mutualFollowRate: number;
}

interface CityIdentityStats {
    verified: number;
    unverified: number;
    error: number;
    pending: number;
    noNip05: number;
    missingProfile: number;
    verifiedRate: number;
}

interface CityProfileQualityStats {
    loaded: number;
    missing: number;
    withNip05: number;
    withLightning: number;
    declaredBots: number;
    loadedRate: number;
    lightningRate: number;
    botRate: number;
}

interface CityTerrainStats {
    parks: number;
}

export interface CityStats {
    housing: CityHousingStats;
    social: CitySocialStats;
    identity: CityIdentityStats;
    profileQuality: CityProfileQualityStats;
    terrain: CityTerrainStats;
}

function toSafeCount(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function percentage(part: number, total: number): number {
    if (total <= 0) {
        return 0;
    }

    return (part / total) * 100;
}

function dedupePubkeys(pubkeys: string[]): string[] {
    return [...new Set(pubkeys.map((pubkey) => pubkey.trim()).filter(Boolean))];
}

function hasNip05(profile: NostrProfile): boolean {
    return Boolean(profile.nip05?.trim());
}

function hasLightningAddress(profile: NostrProfile): boolean {
    return Boolean(profile.lud16?.trim() || profile.lud06?.trim());
}

export function buildCityStats(input: CityStatsInput): CityStats {
    const totalBuildings = toSafeCount(input.buildingsCount);
    const occupiedBuildings = Math.min(totalBuildings, toSafeCount(input.occupiedBuildingsCount));
    const availableBuildings = Math.max(0, totalBuildings - occupiedBuildings);
    const followedPubkeys = dedupePubkeys(input.followedPubkeys);
    const followerPubkeys = dedupePubkeys(input.followerPubkeys);
    const followerSet = new Set(followerPubkeys);
    const following = followedPubkeys.length;
    const followers = followerPubkeys.length;
    const mutualFollows = followedPubkeys.filter((pubkey) => followerSet.has(pubkey)).length;
    const parks = toSafeCount(input.parkCount);

    const identity: Omit<CityIdentityStats, 'verifiedRate'> = {
        verified: 0,
        unverified: 0,
        error: 0,
        pending: 0,
        noNip05: 0,
        missingProfile: 0,
    };
    const profileQuality: Omit<CityProfileQualityStats, 'loadedRate' | 'lightningRate' | 'botRate'> = {
        loaded: 0,
        missing: 0,
        withNip05: 0,
        withLightning: 0,
        declaredBots: 0,
    };

    for (const pubkey of followedPubkeys) {
        const profile = input.profilesByPubkey[pubkey];
        if (!profile) {
            identity.missingProfile += 1;
            profileQuality.missing += 1;
            continue;
        }

        profileQuality.loaded += 1;

        if (hasLightningAddress(profile)) {
            profileQuality.withLightning += 1;
        }
        if (profile.bot === true) {
            profileQuality.declaredBots += 1;
        }

        if (!hasNip05(profile)) {
            identity.noNip05 += 1;
            continue;
        }

        profileQuality.withNip05 += 1;
        const status = input.verificationByPubkey[pubkey]?.status;
        if (status === 'verified') {
            identity.verified += 1;
            continue;
        }
        if (status === 'unverified') {
            identity.unverified += 1;
            continue;
        }
        if (status === 'error') {
            identity.error += 1;
            continue;
        }
        identity.pending += 1;
    }

    return {
        housing: {
            total: totalBuildings,
            occupied: occupiedBuildings,
            available: availableBuildings,
            occupancyRate: percentage(occupiedBuildings, totalBuildings),
        },
        social: {
            following,
            followers,
            mutualFollows,
            mutualFollowRate: percentage(mutualFollows, following),
        },
        identity: {
            ...identity,
            verifiedRate: percentage(identity.verified, following),
        },
        profileQuality: {
            ...profileQuality,
            loadedRate: percentage(profileQuality.loaded, following),
            lightningRate: percentage(profileQuality.withLightning, following),
            botRate: percentage(profileQuality.declaredBots, following),
        },
        terrain: {
            parks,
        },
    };
}
