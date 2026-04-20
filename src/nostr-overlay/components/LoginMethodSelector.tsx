import { useState } from 'react';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { LoginMethod } from '../../nostr/auth/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface LoginMethodSelectorProps {
    disabled?: boolean;
    loadingText?: string;
    onStartSession: (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;
    initialMethod?: SelectorMethod;
}

type SelectorMethod = 'npub' | 'nip07' | 'nip46';

const selectorMethodLabels: Record<SelectorMethod, string> = {
    npub: 'npub (solo lectura)',
    nip07: 'Extension (NIP-07)',
    nip46: 'Bunker (NIP-46)',
};

export function LoginMethodSelector({
    disabled = false,
    loadingText,
    onStartSession,
    initialMethod = 'npub',
}: LoginMethodSelectorProps) {
    const [method, setMethod] = useState<SelectorMethod>(initialMethod);
    const [npub, setNpub] = useState('');
    const [bunkerUri, setBunkerUri] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const run = async (action: () => Promise<void> | void) => {
        setIsSubmitting(true);
        try {
            await action();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo completar la accion';
            toast.error(message, { duration: 2200 });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNpubSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const credential = npub.trim();
        if (!credential) {
            return;
        }

        await run(async () => {
            await onStartSession('npub', { credential });
        });
    };

    const isBusy = disabled || isSubmitting;
    const busyLabel = loadingText && loadingText.trim().length > 0 ? loadingText : 'Cargando...';

    const handleNip46Submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = bunkerUri.trim();
        if (!value) {
            return;
        }

        await run(async () => {
            await onStartSession('nip46', { bunkerUri: value });
        });
    };

    return (
        <section className="grid gap-3" data-testid="login-method-selector" aria-label="Selector de login de Nostr">
            <div className="grid gap-2">
                <Label htmlFor="nostr-login-method-trigger">
                    Metodo de acceso
                </Label>
                <Select value={method} onValueChange={(value) => setMethod(value as SelectorMethod)} disabled={isBusy}>
                    <SelectTrigger id="nostr-login-method-trigger" className="w-full" data-testid="login-method-trigger" aria-label="Metodo de login">
                        <SelectValue>{selectorMethodLabels[method]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="npub">{selectorMethodLabels.npub}</SelectItem>
                            <SelectItem value="nip07">{selectorMethodLabels.nip07}</SelectItem>
                            <SelectItem value="nip46">{selectorMethodLabels.nip46}</SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {method === 'npub' ? (
                <form className="grid gap-2" data-testid="login-method-form-npub" onSubmit={handleNpubSubmit}>
                    <Label htmlFor="nostr-npub-input">
                        Public key
                    </Label>

                    <Input
                        id="nostr-npub-input"
                        name="npub"
                        placeholder="npub1..."
                        value={npub}
                        disabled={isBusy}
                        onChange={(event) => setNpub(event.target.value)}
                    />

                    <Button type="submit" className="mt-2 w-full" data-testid="login-method-submit-npub" disabled={isBusy || npub.trim().length === 0}>
                        {isBusy ? (
                            <>
                                <Spinner data-icon="inline-start" />
                                {busyLabel}
                            </>
                        ) : 'Acceder'}
                    </Button>
                </form>
            ) : null}

            {method === 'nip07' ? (
                <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">Usa tu extension Nostr para firmar sin exponer tu clave privada.</p>
                    <Button
                        type="button"
                        className="mt-2 w-full"
                        data-testid="login-method-submit-nip07"
                        onClick={() => {
                            void run(async () => {
                                await onStartSession('nip07', {});
                            });
                        }}
                        disabled={isBusy}
                    >
                        {isBusy ? (
                            <>
                                <Spinner data-icon="inline-start" />
                                {busyLabel}
                            </>
                        ) : 'Continuar con extension'}
                    </Button>
                </div>
            ) : null}

            {method === 'nip46' ? (
                <form className="grid gap-2" data-testid="login-method-form-nip46" onSubmit={handleNip46Submit}>
                    <Label htmlFor="nostr-bunker-uri-input">
                        URI de bunker
                    </Label>

                    <Input
                        id="nostr-bunker-uri-input"
                        name="bunker-uri"
                        placeholder="bunker://... o nostrconnect://..."
                        value={bunkerUri}
                        disabled={isBusy}
                        onChange={(event) => setBunkerUri(event.target.value)}
                    />

                    <Button type="submit" className="mt-2 w-full" data-testid="login-method-submit-nip46" disabled={isBusy || bunkerUri.trim().length === 0}>
                        {isBusy ? (
                            <>
                                <Spinner data-icon="inline-start" />
                                {busyLabel}
                            </>
                        ) : 'Conectar bunker'}
                    </Button>
                </form>
            ) : null}
        </section>
    );
}
