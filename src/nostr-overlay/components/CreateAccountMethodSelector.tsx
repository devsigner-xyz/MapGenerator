import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type CreateAccountMethod = 'external' | 'local';

interface CreateAccountMethodSelectorProps {
    disabled?: boolean;
    onSelectMethod: (method: CreateAccountMethod) => void;
}

export function CreateAccountMethodSelector({ disabled = false, onSelectMethod }: CreateAccountMethodSelectorProps) {
    return (
        <section className="flex flex-col gap-4" aria-label="Selector de alta de Nostr">
            <Card>
                <CardHeader>
                    <CardTitle>Crear cuenta</CardTitle>
                    <CardDescription>Elige si quieres conectar un signer externo o crear una identidad nueva aqui.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <Button type="button" variant="outline" className="w-full justify-start" disabled={disabled} onClick={() => onSelectMethod('external')}>
                        Usar app o extension
                    </Button>
                    <Button type="button" className="w-full justify-start" disabled={disabled} onClick={() => onSelectMethod('local')}>
                        Crear cuenta en esta app
                    </Button>
                </CardContent>
            </Card>
        </section>
    );
}
