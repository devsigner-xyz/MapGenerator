import { getEventHash } from 'nostr-tools';
import type { NostrEvent } from '../../types';
import type { EncryptionScheme } from '../session';
import {
    AUTH_PROVIDER_ERROR,
    AuthProviderError,
    capabilitiesForMethod,
    type AuthProvider,
    type ProviderResolveInput,
    type ProviderResolvedSession,
    type UnsignedNostrEvent,
} from './types';

interface Nip07Window {
    getPublicKey(): Promise<string>;
    signEvent(event: unknown): Promise<{ sig: string; id?: string; pubkey?: string } | NostrEvent>;
    nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
    nip44?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
}

type EventHashInput = Parameters<typeof getEventHash>[0];

function getNip07Extension(): Nip07Window | undefined {
    return (window as unknown as { nostr?: Nip07Window }).nostr;
}

export class Nip07AuthProvider implements AuthProvider {
    method = 'nip07' as const;
    supports = capabilitiesForMethod(this.method);
    private activePubkey: string | undefined;

    private requireExtension(): Nip07Window {
        const extension = getNip07Extension();
        if (!extension) {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
                'NIP-07 extension is not available in window.nostr'
            );
        }

        return extension;
    }

    private requirePubkey(): string {
        if (!this.activePubkey) {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_LOCKED, 'NIP-07 session is not initialized');
        }

        return this.activePubkey;
    }

    async resolveSession(_input: ProviderResolveInput): Promise<ProviderResolvedSession> {
        const extension = this.requireExtension();
        const pubkey = await extension.getPublicKey();
        this.activePubkey = pubkey;

        const encryptionSchemes: EncryptionScheme[] = [];
        if (extension.nip04) {
            encryptionSchemes.push('nip04');
        }
        if (extension.nip44) {
            encryptionSchemes.push('nip44');
        }

        this.supports = {
            canSign: true,
            canEncrypt: encryptionSchemes.length > 0,
            encryptionSchemes,
        };

        return {
            method: this.method,
            pubkey,
            readonly: false,
            locked: false,
            capabilities: this.supports,
        };
    }

    async signEvent(event: UnsignedNostrEvent): Promise<NostrEvent> {
        const extension = this.requireExtension();
        const pubkey = this.requirePubkey();

        const eventWithPubkey = {
            ...event,
            pubkey,
        };

        const signed = await extension.signEvent(eventWithPubkey);
        const signedSig = (signed as { sig?: unknown }).sig;

        if (typeof signedSig !== 'string' || signedSig.length === 0) {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE, 'NIP-07 signer did not return a signature');
        }

        const signedId =
            typeof (signed as { id?: unknown }).id === 'string'
                ? ((signed as { id: string }).id)
                : getEventHash(eventWithPubkey as unknown as EventHashInput);

        return {
            ...eventWithPubkey,
            id: signedId,
            sig: signedSig,
        };
    }

    async encrypt(pubkey: string, plaintext: string, scheme?: EncryptionScheme): Promise<string> {
        const extension = this.requireExtension();
        const preferredScheme = scheme ?? (extension.nip44 ? 'nip44' : 'nip04');

        if (preferredScheme === 'nip44' && extension.nip44) {
            return extension.nip44.encrypt(pubkey, plaintext);
        }

        if (preferredScheme === 'nip04' && extension.nip04) {
            return extension.nip04.encrypt(pubkey, plaintext);
        }

        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
            `NIP-07 extension does not support ${preferredScheme} encryption`
        );
    }

    async decrypt(pubkey: string, ciphertext: string, scheme?: EncryptionScheme): Promise<string> {
        const extension = this.requireExtension();
        const preferredScheme = scheme ?? (extension.nip44 ? 'nip44' : 'nip04');

        if (preferredScheme === 'nip44' && extension.nip44) {
            return extension.nip44.decrypt(pubkey, ciphertext);
        }

        if (preferredScheme === 'nip04' && extension.nip04) {
            return extension.nip04.decrypt(pubkey, ciphertext);
        }

        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
            `NIP-07 extension does not support ${preferredScheme} decryption`
        );
    }

    async lock(): Promise<void> {
        this.activePubkey = undefined;
    }
}
