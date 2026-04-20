import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NpubFormProps {
    disabled?: boolean;
    onSubmit: (npub: string) => Promise<void> | void;
}

export function NpubForm({ disabled = false, onSubmit }: NpubFormProps) {
    const [npub, setNpub] = useState('');

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = npub.trim();
        if (!value) {
            return;
        }

        await onSubmit(value);
    };

    return (
        <form className="grid gap-2" data-testid="npub-form" onSubmit={handleSubmit}>
            <Label htmlFor="nostr-npub-input">
                Public Key
            </Label>

            <div className="flex min-w-0 items-center gap-2">
                <Input
                    id="nostr-npub-input"
                    name="npub"
                    className="min-w-0 flex-1"
                    placeholder="npub1..."
                    value={npub}
                    disabled={disabled}
                    onChange={(event) => setNpub(event.target.value)}
                />

                <Button className="shrink-0 whitespace-nowrap" data-testid="npub-submit" type="submit" disabled={disabled || npub.trim().length === 0}>
                    Acceder
                </Button>
            </div>
        </form>
    );
}
