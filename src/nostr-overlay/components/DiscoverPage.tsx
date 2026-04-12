import type { ComponentProps } from 'react';
import { EasterEggMissionsDialog } from './EasterEggMissionsDialog';

type DiscoverPageProps = Omit<ComponentProps<typeof EasterEggMissionsDialog>, 'variant'>;

export function DiscoverPage(props: DiscoverPageProps) {
    return <EasterEggMissionsDialog {...props} variant="surface" />;
}
