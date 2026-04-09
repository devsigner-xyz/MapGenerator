import { useState } from 'react';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { LoginMethod } from '../../nostr/auth/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    onStartSession: (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;
}

type SelectorMethod = 'npub' | 'nsec' | 'nip07';

const selectorMethodLabels: Record<SelectorMethod, string> = {
    npub: 'npub (solo lectura)',
    nsec: 'nsec',
    nip07: 'Extension (NIP-07)',
};

export function LoginMethodSelector({
    disabled = false,
    onStartSession,
}: LoginMethodSelectorProps) {
    const [method, setMethod] = useState<SelectorMethod>('npub');
    const [npub, setNpub] = useState('');
    const [nsec, setNsec] = useState('');
    const [nsecPassphrase, setNsecPassphrase] = useState('');
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

    const handleNsecSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const credential = nsec.trim();
        if (!credential) {
            return;
        }

        await run(async () => {
            await onStartSession('nsec', {
                credential,
                passphrase: nsecPassphrase.trim() || undefined,
            });
        });
    };

    const isBusy = disabled || isSubmitting;

    return (
        <section className="nostr-login-selector" aria-label="Selector de login de Nostr">
            <p className="nostr-kicker">Accede o explora</p>

            <div className="nostr-form">
                <Label className="nostr-label" htmlFor="nostr-login-method-trigger">
                    Metodo de acceso
                </Label>
                <Select value={method} onValueChange={(value) => setMethod(value as SelectorMethod)} disabled={isBusy}>
                    <SelectTrigger id="nostr-login-method-trigger" className="nostr-login-method-select" aria-label="Metodo de login">
                        <SelectValue>{selectorMethodLabels[method]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="npub">{selectorMethodLabels.npub}</SelectItem>
                            <SelectItem value="nsec">{selectorMethodLabels.nsec}</SelectItem>
                            <SelectItem value="nip07">{selectorMethodLabels.nip07}</SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {method === 'npub' ? (
                <form className="nostr-form" onSubmit={handleNpubSubmit}>
                    <Label className="nostr-label" htmlFor="nostr-npub-input">
                        Nostr npub
                    </Label>

                    <div className="nostr-npub-row">
                        <Input
                            id="nostr-npub-input"
                            name="npub"
                            className="nostr-input"
                            placeholder="npub1..."
                            value={npub}
                            disabled={isBusy}
                            onChange={(event) => setNpub(event.target.value)}
                        />

                        <Button className="nostr-submit" type="submit" disabled={isBusy || npub.trim().length === 0}>
                            Visualize
                        </Button>
                    </div>
                </form>
            ) : null}

            {method === 'nsec' ? (
                <form className="nostr-form" onSubmit={handleNsecSubmit}>
                    <Label className="nostr-label" htmlFor="nostr-nsec-input">
                        Nostr nsec
                    </Label>

                    <Input
                        id="nostr-nsec-input"
                        name="nsec"
                        className="nostr-input"
                        type="password"
                        placeholder="nsec1..."
                        value={nsec}
                        disabled={isBusy}
                        onChange={(event) => setNsec(event.target.value)}
                    />

                    <Label className="nostr-label" htmlFor="nostr-nsec-passphrase-input">
                        Passphrase para cifrar (recomendado)
                    </Label>

                    <div className="nostr-npub-row">
                        <Input
                            id="nostr-nsec-passphrase-input"
                            name="nsec-passphrase"
                            className="nostr-input"
                            type="password"
                            placeholder="Minimo 8 caracteres"
                            value={nsecPassphrase}
                            disabled={isBusy}
                            onChange={(event) => setNsecPassphrase(event.target.value)}
                        />

                        <Button className="nostr-submit" type="submit" disabled={isBusy || nsec.trim().length === 0}>
                            Continuar
                        </Button>
                    </div>
                </form>
            ) : null}

            {method === 'nip07' ? (
                <div className="nostr-panel-actions">
                    <p className="nostr-label">Usa tu extension Nostr para firmar sin exponer tu clave privada.</p>
                    <Button
                        type="button"
                        className="nostr-submit"
                        onClick={() => {
                            void run(async () => {
                                await onStartSession('nip07', {});
                            });
                        }}
                        disabled={isBusy}
                    >
                        Continuar con extension
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
