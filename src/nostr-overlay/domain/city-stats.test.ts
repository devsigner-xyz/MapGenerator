import { describe, expect, test } from 'vitest';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import { buildCityStats } from './city-stats';

function verification(status: Nip05ValidationResult['status']): Nip05ValidationResult {
    return {
        status,
        identifier: `${status}@example.com`,
        checkedAt: 1,
    };
}

describe('buildCityStats', () => {
    test('calculates housing KPIs', () => {
        const stats = buildCityStats({
            buildingsCount: 120,
            occupiedBuildingsCount: 72,
            followedPubkeys: [],
            followerPubkeys: [],
            profilesByPubkey: {},
            verificationByPubkey: {},
            parkCount: 7,
        });

        expect(stats.housing.total).toBe(120);
        expect(stats.housing.occupied).toBe(72);
        expect(stats.housing.available).toBe(48);
        expect(stats.housing.occupancyRate).toBeCloseTo(60, 2);
        expect(stats.terrain.parks).toBe(7);
    });

    test('calculates Nostr identity and profile quality stats for followed pubkeys', () => {
        const stats = buildCityStats({
            buildingsCount: 10,
            occupiedBuildingsCount: 5,
            followedPubkeys: [
                'verified',
                'unverified',
                'error',
                'missing-nip05',
                'missing-profile',
                'lightning',
                'bot',
                'mutual',
                'pending',
            ],
            followerPubkeys: ['mutual', 'follower-only'],
            profilesByPubkey: {
                verified: { pubkey: 'verified', nip05: 'verified@example.com' },
                unverified: { pubkey: 'unverified', nip05: 'unverified@example.com' },
                error: { pubkey: 'error', nip05: 'error@example.com' },
                'missing-nip05': { pubkey: 'missing-nip05' },
                lightning: { pubkey: 'lightning', lud16: 'pay@example.com' },
                bot: { pubkey: 'bot', bot: true },
                mutual: { pubkey: 'mutual', lud06: 'lnurl1example' },
                pending: { pubkey: 'pending', nip05: 'pending@example.com' },
            },
            verificationByPubkey: {
                verified: verification('verified'),
                unverified: verification('unverified'),
                error: verification('error'),
            },
            parkCount: 1,
        });

        expect(stats.social.following).toBe(9);
        expect(stats.social.followers).toBe(2);
        expect(stats.social.mutualFollows).toBe(1);
        expect(stats.social.mutualFollowRate).toBeCloseTo(11.11, 2);
        expect(stats.identity).toEqual({
            verified: 1,
            unverified: 1,
            error: 1,
            pending: 1,
            noNip05: 4,
            missingProfile: 1,
            verifiedRate: 11.11111111111111,
        });
        expect(stats.profileQuality).toEqual({
            loaded: 8,
            missing: 1,
            withNip05: 4,
            withLightning: 2,
            declaredBots: 1,
            loadedRate: 88.88888888888889,
            lightningRate: 22.22222222222222,
            botRate: 11.11111111111111,
        });
    });
});
