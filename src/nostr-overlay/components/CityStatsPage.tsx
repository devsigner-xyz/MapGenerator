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
        { name: t('cityStats.housing.occupied'), value: stats.housing.occupied, color: '#3b768f' },
        { name: t('cityStats.housing.available'), value: stats.housing.available, color: '#b9d6e3' },
    ];

    const populationData = [
        { label: t('cityStats.population.housed'), value: stats.population.assigned },
        { label: t('cityStats.population.unhoused'), value: stats.population.unhoused },
    ];

    const demographicData = [
        { label: t('cityStats.network.following'), value: stats.network.follows },
        { label: t('cityStats.network.followers'), value: stats.network.followers },
    ];

    return (
        <section className="nostr-routed-surface" aria-label={t('cityStats.aria')}>
            <div className="nostr-routed-surface-content">
                <div className="nostr-city-stats-page nostr-routed-surface-panel nostr-page-layout sm:max-w-none">
                    <div className="nostr-city-stats-body">
                        <OverlayPageHeader
                            className="nostr-city-stats-header"
                            title={t('cityStats.title')}
                            description={t('cityStats.description')}
                        />

                        <section className="nostr-city-kpi-grid" aria-label={t('cityStats.kpis')}>
                            <article className="nostr-city-kpi-card"><p>{t('cityStats.kpi.totalHomes')}</p><strong>{stats.housing.total}</strong></article>
                            <article className="nostr-city-kpi-card"><p>{t('cityStats.kpi.occupiedBuildings')}</p><strong>{stats.housing.occupied}</strong></article>
                            <article className="nostr-city-kpi-card"><p>{t('cityStats.kpi.availableHomes')}</p><strong>{stats.housing.available}</strong></article>
                            <article className="nostr-city-kpi-card"><p>{t('cityStats.kpi.occupancyRate')}</p><strong>{formatPercent(stats.housing.occupancyRate)}</strong></article>
                            <article className="nostr-city-kpi-card"><p>{t('cityStats.kpi.assignedPopulation')}</p><strong>{stats.population.assigned}</strong></article>
                            <article className="nostr-city-kpi-card"><p>{t('cityStats.kpi.unhousedDemand')}</p><strong>{stats.population.unhoused}</strong></article>
                            <article className="nostr-city-kpi-card"><p>{t('cityStats.kpi.detectedFollowers')}</p><strong>{stats.network.followers}</strong></article>
                            <article className="nostr-city-kpi-card"><p>{t('cityStats.kpi.parks')}</p><strong>{stats.terrain.parks}</strong></article>
                        </section>

                        <section className="nostr-city-chart-section">
                            <h4>{t('cityStats.section.housing')}</h4>
                            <div className="nostr-city-chart" role="img" aria-label={t('cityStats.section.housingAria')}>
                                <ResponsiveContainer width="100%" height={200}>
                                    <PieChart>
                                        <Pie data={housingData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                                            {housingData.map((entry) => (
                                                <Cell key={entry.name} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => formatTooltipValue(value)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </section>

                        <section className="nostr-city-chart-section">
                            <h4>{t('cityStats.section.population')}</h4>
                            <div className="nostr-city-chart" role="img" aria-label={t('cityStats.section.populationAria')}>
                                <ResponsiveContainer width="100%" height={210}>
                                    <BarChart data={populationData} margin={{ top: 8, right: 8, bottom: 6, left: 0 }}>
                                        <XAxis dataKey="label" />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip formatter={(value) => formatTooltipValue(value)} />
                                        <Bar dataKey="value" fill="#4f89a4" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>

                        <section className="nostr-city-chart-section">
                            <h4>{t('cityStats.section.network')}</h4>
                            <div className="nostr-city-chart" role="img" aria-label={t('cityStats.section.networkAria')}>
                                <ResponsiveContainer width="100%" height={210}>
                                    <BarChart data={demographicData} margin={{ top: 8, right: 8, bottom: 6, left: 0 }}>
                                        <XAxis dataKey="label" />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip formatter={(value) => formatTooltipValue(value)} />
                                        <Bar dataKey="value" fill="#86b0c3" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="nostr-city-coverage">{t('cityStats.coverage', { value: formatPercent(stats.population.coverageRate) })}</p>
                        </section>
                    </div>
                </div>
            </div>
        </section>
    );
}
