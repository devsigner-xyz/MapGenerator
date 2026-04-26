import {
    Bar,
    BarChart,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { OverlayPageHeader } from './OverlayPageHeader';
import { useI18n } from '@/i18n/useI18n';
import { buildCityStats } from '../domain/city-stats';
import { OverlaySurface } from './OverlaySurface';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CityStatsPageProps {
    buildingsCount: number;
    occupiedBuildingsCount: number;
    followedPubkeys: string[];
    followerPubkeys: string[];
    profilesByPubkey: Record<string, NostrProfile>;
    verificationByPubkey: Record<string, Nip05ValidationResult | undefined>;
    parkCount: number;
}

function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}

function formatTooltipValue(value: unknown): string {
    if (typeof value === 'number') {
        return value.toLocaleString();
    }

    if (typeof value === 'string') {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toLocaleString() : value;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => formatTooltipValue(entry)).join(', ');
    }

    return String(value ?? '');
}

function formatCountWithPercent(count: number, percent: number): string {
    return `${count.toLocaleString()} (${formatPercent(percent)})`;
}

export function CityStatsPage({
    buildingsCount,
    occupiedBuildingsCount,
    followedPubkeys,
    followerPubkeys,
    profilesByPubkey,
    verificationByPubkey,
    parkCount,
}: CityStatsPageProps) {
    const { t } = useI18n();
    const stats = buildCityStats({
        buildingsCount,
        occupiedBuildingsCount,
        followedPubkeys,
        followerPubkeys,
        profilesByPubkey,
        verificationByPubkey,
        parkCount,
    });

    const housingData = [
        { name: t('cityStats.housing.occupied'), value: stats.housing.occupied, color: 'var(--chart-2)' },
        { name: t('cityStats.housing.available'), value: stats.housing.available, color: 'var(--chart-1)' },
    ];

    const identityData = [
        { name: t('cityStats.identity.verified'), value: stats.identity.verified, color: 'var(--chart-2)' },
        { name: t('cityStats.identity.unverified'), value: stats.identity.unverified, color: 'var(--chart-4)' },
        { name: t('cityStats.identity.error'), value: stats.identity.error, color: 'var(--chart-5)' },
        { name: t('cityStats.identity.pending'), value: stats.identity.pending, color: 'var(--chart-3)' },
        { name: t('cityStats.identity.noNip05'), value: stats.identity.noNip05, color: 'var(--chart-1)' },
        { name: t('cityStats.identity.missingProfile'), value: stats.identity.missingProfile, color: 'var(--muted-foreground)' },
    ];

    const profileQualityData = [
        { label: t('cityStats.profileQuality.loaded'), value: stats.profileQuality.loaded },
        { label: t('cityStats.profileQuality.withNip05'), value: stats.profileQuality.withNip05 },
        { label: t('cityStats.profileQuality.withLightning'), value: stats.profileQuality.withLightning },
        { label: t('cityStats.profileQuality.declaredBots'), value: stats.profileQuality.declaredBots },
    ];

    const kpiCards = [
        { label: t('cityStats.kpi.totalHomes'), value: stats.housing.total },
        { label: t('cityStats.kpi.occupiedBuildings'), value: stats.housing.occupied },
        { label: t('cityStats.kpi.occupancyRate'), value: formatPercent(stats.housing.occupancyRate) },
        { label: t('cityStats.kpi.parks'), value: stats.terrain.parks },
        { label: t('cityStats.kpi.following'), value: stats.social.following },
        { label: t('cityStats.kpi.nip05Verified'), value: formatCountWithPercent(stats.identity.verified, stats.identity.verifiedRate) },
        { label: t('cityStats.kpi.mutualFollows'), value: formatCountWithPercent(stats.social.mutualFollows, stats.social.mutualFollowRate) },
        { label: t('cityStats.kpi.lightningProfiles'), value: formatCountWithPercent(stats.profileQuality.withLightning, stats.profileQuality.lightningRate) },
        { label: t('cityStats.kpi.loadedProfiles'), value: formatCountWithPercent(stats.profileQuality.loaded, stats.profileQuality.loadedRate) },
        { label: t('cityStats.kpi.declaredBots'), value: formatCountWithPercent(stats.profileQuality.declaredBots, stats.profileQuality.botRate) },
    ];

    const chartTooltipStyles = {
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
        color: 'var(--card-foreground)',
        borderRadius: 'var(--radius)',
    };

    const chartTickStyle = {
        fill: 'var(--muted-foreground)',
        fontSize: 12,
    };

    const chartSecondaryBarFill = 'var(--chart-1)';

    return (
        <OverlaySurface ariaLabel={t('cityStats.aria')}>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="nostr-city-stats-page nostr-routed-surface-panel nostr-page-layout sm:max-w-none">
                    <div className="nostr-city-stats-body">
                        <OverlayPageHeader
                            className="nostr-city-stats-header"
                            title={t('cityStats.title')}
                            description={t('cityStats.description')}
                        />

                        <section className="nostr-city-kpi-grid" aria-label={t('cityStats.kpis')}>
                            {kpiCards.map((card) => (
                                <Card key={card.label} size="sm" data-testid="city-stats-kpi-card" className="gap-0 py-0">
                                    <CardHeader className="px-4 py-3">
                                        <CardDescription>{card.label}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4 pt-0">
                                        <p className="text-2xl font-semibold tracking-tight text-foreground">{card.value}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </section>

                        <section className="nostr-city-chart-section">
                            <Card size="sm" data-testid="city-stats-chart-card" className="gap-0 py-0">
                                <CardHeader className="px-4 py-3">
                                    <CardTitle>{t('cityStats.section.housing')}</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3 pt-0">
                                    <div role="img" aria-label={t('cityStats.section.housingAria')}>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <PieChart>
                                                <Pie data={housingData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                                                    {housingData.map((entry) => (
                                                        <Cell key={entry.name} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value) => formatTooltipValue(value)}
                                                    contentStyle={chartTooltipStyles}
                                                    itemStyle={{ color: 'var(--card-foreground)' }}
                                                    labelStyle={{ color: 'var(--card-foreground)' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        <section className="nostr-city-chart-section">
                            <Card size="sm" data-testid="city-stats-chart-card" className="gap-0 py-0">
                                <CardHeader className="px-4 py-3">
                                    <CardTitle>{t('cityStats.section.identity')}</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3 pt-0">
                                    <div role="img" aria-label={t('cityStats.section.identityAria')}>
                                        <ResponsiveContainer width="100%" height={220}>
                                            <PieChart>
                                                <Pie data={identityData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                                                    {identityData.map((entry) => (
                                                        <Cell key={entry.name} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value) => formatTooltipValue(value)}
                                                    contentStyle={chartTooltipStyles}
                                                    itemStyle={{ color: 'var(--card-foreground)' }}
                                                    labelStyle={{ color: 'var(--card-foreground)' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        <section className="nostr-city-chart-section">
                            <Card size="sm" data-testid="city-stats-chart-card" className="gap-0 py-0">
                                <CardHeader className="px-4 py-3">
                                    <CardTitle>{t('cityStats.section.profileQuality')}</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3 pt-0">
                                    <div role="img" aria-label={t('cityStats.section.profileQualityAria')}>
                                        <ResponsiveContainer width="100%" height={210}>
                                            <BarChart data={profileQualityData} margin={{ top: 8, right: 8, bottom: 6, left: 0 }}>
                                                <XAxis dataKey="label" tick={chartTickStyle} />
                                                <YAxis allowDecimals={false} tick={chartTickStyle} />
                                                <Tooltip
                                                    formatter={(value) => formatTooltipValue(value)}
                                                    contentStyle={chartTooltipStyles}
                                                    itemStyle={{ color: 'var(--card-foreground)' }}
                                                    labelStyle={{ color: 'var(--card-foreground)' }}
                                                />
                                                <Bar dataKey="value" fill={chartSecondaryBarFill} radius={[6, 6, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        </section>
                    </div>
                </div>
            </div>
        </OverlaySurface>
    );
}
