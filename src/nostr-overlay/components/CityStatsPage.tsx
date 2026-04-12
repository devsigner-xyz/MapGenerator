import type { ComponentProps } from 'react';
import { CityStatsDialog } from './CityStatsDialog';

type CityStatsPageProps = Omit<ComponentProps<typeof CityStatsDialog>, 'variant'>;

export function CityStatsPage(props: CityStatsPageProps) {
    return <CityStatsDialog {...props} variant="surface" />;
}
