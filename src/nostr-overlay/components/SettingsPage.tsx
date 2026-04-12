import type { ComponentProps } from 'react';
import { MapSettingsPage } from './MapSettingsPage';

type SettingsPageProps = Omit<ComponentProps<typeof MapSettingsPage>, 'variant'>;

export function SettingsPage(props: SettingsPageProps) {
    return <MapSettingsPage {...props} variant="surface" />;
}
