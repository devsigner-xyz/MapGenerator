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
        <form className="nostr-form" onSubmit={handleSubmit}>
            <Label className="nostr-label" htmlFor="nostr-npub-input">
                Public Key
            </Label>

            <div className="nostr-npub-row">
                <Input
                    id="nostr-npub-input"
                    name="npub"
                    className="nostr-input"
                    placeholder="npub1..."
                    value={npub}
                    disabled={disabled}
                    onChange={(event) => setNpub(event.target.value)}
                />

                <Button className="nostr-submit" type="submit" disabled={disabled || npub.trim().length === 0}>
                    Acceder
                </Button>
            </div>
        </form>
    );
}
