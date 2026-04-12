import type { ComponentProps } from 'react';
import { GlobalUserSearchDialog } from './GlobalUserSearchDialog';

type UserSearchPageProps = Omit<ComponentProps<typeof GlobalUserSearchDialog>, 'variant'>;

export function UserSearchPage(props: UserSearchPageProps) {
    return <GlobalUserSearchDialog {...props} variant="surface" />;
}
