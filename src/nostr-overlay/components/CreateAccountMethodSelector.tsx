import { ChevronRightIcon } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';

export type CreateAccountMethod = 'external' | 'local';

interface CreateAccountMethodSelectorProps {
    disabled?: boolean;
    onSelectMethod: (method: CreateAccountMethod) => void;
}

export function CreateAccountMethodSelector({ disabled = false, onSelectMethod }: CreateAccountMethodSelectorProps) {
    const { t } = useI18n();

    return (
        <section className="flex flex-col gap-4" aria-label={t('auth.createMethod.aria')}>
            <ItemGroup>
                <Item asChild variant="outline" className="w-full">
                    <button type="button" disabled={disabled} onClick={() => onSelectMethod('external')}>
                        <ItemContent>
                            <ItemTitle>{t('auth.createMethod.external.title')}</ItemTitle>
                            <ItemDescription>{t('auth.createMethod.external.description')}</ItemDescription>
                        </ItemContent>
                        <ItemActions className="text-muted-foreground">
                            <ChevronRightIcon aria-hidden="true" />
                        </ItemActions>
                    </button>
                </Item>
                <Item asChild variant="outline" className="w-full">
                    <button type="button" disabled={disabled} onClick={() => onSelectMethod('local')}>
                        <ItemContent>
                            <ItemTitle>{t('auth.createMethod.local.title')}</ItemTitle>
                            <ItemDescription>{t('auth.createMethod.local.description')}</ItemDescription>
                        </ItemContent>
                        <ItemActions className="text-muted-foreground">
                            <ChevronRightIcon aria-hidden="true" />
                        </ItemActions>
                    </button>
                </Item>
            </ItemGroup>
        </section>
    );
}
