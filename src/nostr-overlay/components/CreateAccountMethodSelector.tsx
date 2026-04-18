import { ChevronRightIcon } from 'lucide-react';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';

export type CreateAccountMethod = 'external' | 'local';

interface CreateAccountMethodSelectorProps {
    disabled?: boolean;
    onSelectMethod: (method: CreateAccountMethod) => void;
}

export function CreateAccountMethodSelector({ disabled = false, onSelectMethod }: CreateAccountMethodSelectorProps) {
    return (
        <section className="flex flex-col gap-4" aria-label="Selector de alta de Nostr">
            <ItemGroup>
                <Item asChild variant="outline" className="w-full">
                    <button type="button" disabled={disabled} onClick={() => onSelectMethod('external')}>
                        <ItemContent>
                            <ItemTitle>Usar app o extension</ItemTitle>
                            <ItemDescription>Conecta una extension o un signer externo.</ItemDescription>
                        </ItemContent>
                        <ItemActions className="text-muted-foreground">
                            <ChevronRightIcon aria-hidden="true" />
                        </ItemActions>
                    </button>
                </Item>
                <Item asChild variant="outline" className="w-full">
                    <button type="button" disabled={disabled} onClick={() => onSelectMethod('local')}>
                        <ItemContent>
                            <ItemTitle>Crear cuenta local</ItemTitle>
                            <ItemDescription>Crea una cuenta nueva en este dispositivo.</ItemDescription>
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
