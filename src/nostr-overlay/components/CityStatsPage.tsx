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
import { OverlayPageHeader } from './OverlayPageHeader';
import { useI18n } from '@/i18n/useI18n';
import { buildCityStats } from '../domain/city-stats';
import { OverlaySurface } from './OverlaySurface';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CityStatsPageProps {
    buildingsCount: number;
    occupiedBuildingsCount: number;
    assignedResidentsCount: number;
    followsCount: number;
    followersCount: number;
    parkCount: number;
    unhousedResidentsCount: number;
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

export function CityStatsPage({
    buildingsCount,
    occupiedBuildingsCount,
    assignedResidentsCount,
    followsCount,
    followersCount,
    parkCount,
    unhousedResidentsCount,
}: CityStatsPageProps) {
    const { t } = useI18n();
    const stats = buildCityStats({
        buildingsCount,
        occupiedBuildingsCount,
        assignedResidentsCount,
        followsCount,
        followersCount,
        parkCount,
        unhousedResidentsCount,
    });

    const housingData = [
        { name: t('cityStats.housing.occupied'), value: stats.housing.occupied, color: 'var(--chart-2)' },
        { name: t('cityStats.housing.available'), value: stats.housing.available, color: 'var(--chart-1)' },
    ];

    const populationData = [
        { label: t('cityStats.population.housed'), value: stats.population.assigned },
        { label: t('cityStats.population.unhoused'), value: stats.population.unhoused },
    ];

    const demographicData = [
        { label: t('cityStats.network.following'), value: stats.network.follows },
        { label: t('cityStats.network.followers'), value: stats.network.followers },
    ];

    const kpiCards = [
        { label: t('cityStats.kpi.totalHomes'), value: stats.housing.total },
        { label: t('cityStats.kpi.occupiedBuildings'), value: stats.housing.occupied },
        { label: t('cityStats.kpi.availableHomes'), value: stats.housing.available },
        { label: t('cityStats.kpi.occupancyRate'), value: formatPercent(stats.housing.occupancyRate) },
        { label: t('cityStats.kpi.assignedPopulation'), value: stats.population.assigned },
        { label: t('cityStats.kpi.unhousedDemand'), value: stats.population.unhoused },
        { label: t('cityStats.kpi.detectedFollowers'), value: stats.network.followers },
        { label: t('cityStats.kpi.parks'), value: stats.terrain.parks },
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

    const chartBarFill = 'var(--chart-2)';
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
                                    <CardTitle>{t('cityStats.section.population')}</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3 pt-0">
                                    <div role="img" aria-label={t('cityStats.section.populationAria')}>
                                        <ResponsiveContainer width="100%" height={210}>
                                            <BarChart data={populationData} margin={{ top: 8, right: 8, bottom: 6, left: 0 }}>
                                                <XAxis dataKey="label" tick={chartTickStyle} />
                                                <YAxis allowDecimals={false} tick={chartTickStyle} />
                                                <Tooltip
                                                    formatter={(value) => formatTooltipValue(value)}
                                                    contentStyle={chartTooltipStyles}
                                                    itemStyle={{ color: 'var(--card-foreground)' }}
                                                    labelStyle={{ color: 'var(--card-foreground)' }}
                                                />
                                                <Bar dataKey="value" fill={chartBarFill} radius={[6, 6, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        <section className="nostr-city-chart-section">
                            <Card size="sm" data-testid="city-stats-chart-card" className="gap-0 py-0">
                                <CardHeader className="px-4 py-3">
                                    <CardTitle>{t('cityStats.section.network')}</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3 pt-0">
                                    <div role="img" aria-label={t('cityStats.section.networkAria')}>
                                        <ResponsiveContainer width="100%" height={210}>
                                            <BarChart data={demographicData} margin={{ top: 8, right: 8, bottom: 6, left: 0 }}>
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
                            <p className="nostr-city-coverage">{t('cityStats.coverage', { value: formatPercent(stats.population.coverageRate) })}</p>
                        </section>
                    </div>
                </div>
            </div>
        </OverlaySurface>
    );
}
