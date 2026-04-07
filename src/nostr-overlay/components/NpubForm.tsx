import { useState } from 'react';
import type { FormEvent } from 'react';

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
            <label className="nostr-label" htmlFor="nostr-npub-input">
                Nostr npub
            </label>
            <input
                id="nostr-npub-input"
                name="npub"
                className="nostr-input"
                placeholder="npub1..."
                value={npub}
                disabled={disabled}
                onChange={(event) => setNpub(event.target.value)}
            />
            <button className="nostr-submit" type="submit" disabled={disabled || npub.trim().length === 0}>
                Cargar seguidos
            </button>
        </form>
    );
}
