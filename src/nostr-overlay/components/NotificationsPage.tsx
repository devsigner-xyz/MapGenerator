import type { ComponentProps } from 'react';
import { NotificationsDialog } from './NotificationsDialog';

type NotificationsPageProps = Omit<ComponentProps<typeof NotificationsDialog>, 'variant'>;

export function NotificationsPage(props: NotificationsPageProps) {
    return <NotificationsDialog {...props} variant="surface" />;
}
