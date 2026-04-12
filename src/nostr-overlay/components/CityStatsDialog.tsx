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
import { buildCityStats } from '../domain/city-stats';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface CityStatsDialogProps {
    buildingsCount: number;
    occupiedBuildingsCount: number;
    assignedResidentsCount: number;
    followsCount: number;
    followersCount: number;
    parkCount: number;
    unhousedResidentsCount: number;
    onClose: () => void;
}

function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}

export function CityStatsDialog({
    buildingsCount,
    occupiedBuildingsCount,
    assignedResidentsCount,
    followsCount,
    followersCount,
    parkCount,
    unhousedResidentsCount,
    onClose,
}: CityStatsDialogProps) {
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
        { name: 'Ocupadas', value: stats.housing.occupied, color: '#3b768f' },
        { name: 'Disponibles', value: stats.housing.available, color: '#b9d6e3' },
    ];

    const populationData = [
        { label: 'Con vivienda', value: stats.population.assigned },
        { label: 'Sin vivienda', value: stats.population.unhoused },
    ];

    const demographicData = [
        { label: 'Sigues', value: stats.network.follows },
        { label: 'Seguidores', value: stats.network.followers },
    ];

    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent className="nostr-dialog nostr-city-stats-dialog sm:max-w-none" showCloseButton={false} aria-label="Estadisticas de la ciudad">
                <DialogTitle className="sr-only">Estadisticas de la ciudad</DialogTitle>
                <DialogDescription className="sr-only">Indicadores de vivienda, poblacion y red del mapa actual.</DialogDescription>
                <Button type="button" variant="ghost" className="nostr-dialog-close" onClick={onClose} aria-label="Cerrar estadisticas de la ciudad">
                    ×
                </Button>

                <div className="nostr-city-stats-body">
                    <header className="nostr-city-stats-header">
                        <h3>Estadisticas de la ciudad</h3>
                        <p>Panorama de vivienda y poblacion asignada en el mapa actual.</p>
                    </header>

                    <section className="nostr-city-kpi-grid" aria-label="KPIs de la ciudad">
                        <article className="nostr-city-kpi-card">
                            <p>Viviendas totales</p>
                            <strong>{stats.housing.total}</strong>
                        </article>
                        <article className="nostr-city-kpi-card">
                            <p>Edificios ocupados</p>
                            <strong>{stats.housing.occupied}</strong>
                        </article>
                        <article className="nostr-city-kpi-card">
                            <p>Viviendas disponibles</p>
                            <strong>{stats.housing.available}</strong>
                        </article>
                        <article className="nostr-city-kpi-card">
                            <p>Tasa de ocupacion</p>
                            <strong>{formatPercent(stats.housing.occupancyRate)}</strong>
                        </article>
                        <article className="nostr-city-kpi-card">
                            <p>Poblacion asignada</p>
                            <strong>{stats.population.assigned}</strong>
                        </article>
                        <article className="nostr-city-kpi-card">
                            <p>Demanda sin vivienda</p>
                            <strong>{stats.population.unhoused}</strong>
                        </article>
                        <article className="nostr-city-kpi-card">
                            <p>Seguidores detectados</p>
                            <strong>{stats.network.followers}</strong>
                        </article>
                        <article className="nostr-city-kpi-card">
                            <p>Numero de parques</p>
                            <strong>{stats.terrain.parks}</strong>
                        </article>
                    </section>

                    <section className="nostr-city-chart-section">
                        <h4>Vivienda ocupada vs disponible</h4>
                        <div className="nostr-city-chart" role="img" aria-label="Grafico circular de viviendas ocupadas y disponibles">
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie
                                        data={housingData}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={44}
                                        outerRadius={72}
                                        paddingAngle={2}
                                    >
                                        {housingData.map((entry) => (
                                            <Cell key={entry.name} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => value.toLocaleString()} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section className="nostr-city-chart-section">
                        <h4>Demografia de ocupacion</h4>
                        <div className="nostr-city-chart" role="img" aria-label="Grafico de barras de poblacion con y sin vivienda">
                            <ResponsiveContainer width="100%" height={210}>
                                <BarChart data={populationData} margin={{ top: 8, right: 8, bottom: 6, left: 0 }}>
                                    <XAxis dataKey="label" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip formatter={(value: number) => value.toLocaleString()} />
                                    <Bar dataKey="value" fill="#4f89a4" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section className="nostr-city-chart-section">
                        <h4>Red demografica</h4>
                        <div className="nostr-city-chart" role="img" aria-label="Grafico de barras de seguidos y seguidores">
                            <ResponsiveContainer width="100%" height={210}>
                                <BarChart data={demographicData} margin={{ top: 8, right: 8, bottom: 6, left: 0 }}>
                                    <XAxis dataKey="label" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip formatter={(value: number) => value.toLocaleString()} />
                                    <Bar dataKey="value" fill="#86b0c3" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="nostr-city-coverage">Cobertura residencial actual: {formatPercent(stats.population.coverageRate)}</p>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
