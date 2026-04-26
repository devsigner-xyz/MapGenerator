import type { ComponentProps } from 'react';
import { DiscoverPage } from '../components/DiscoverPage';

type DiscoverPageProps = ComponentProps<typeof DiscoverPage>;

export interface DiscoverRouteContainerProps {
    discoveredIds: DiscoverPageProps['discoveredIds'];
}

export function DiscoverRouteContainer({ discoveredIds }: DiscoverRouteContainerProps) {
    return (
        <DiscoverPage
            discoveredIds={discoveredIds}
        />
    );
}
