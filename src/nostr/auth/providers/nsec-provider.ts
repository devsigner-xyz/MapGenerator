import { NDKPrivateKeySigner, NDKUser } from '@nostr-dev-kit/ndk';
import { getEventHash } from 'nostr-tools';
import type { NostrEvent } from '../../types';
import { parseCredential } from '../credentials';
import { decryptPrivateKeyFromNcryptsec } from '../secure-storage';
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

export class NsecAuthProvider implements AuthProvider {
    method = 'nsec' as const;
    supports = capabilitiesForMethod(this.method);
    private signer: NDKPrivateKeySigner | undefined;

    private requireSigner(): NDKPrivateKeySigner {
        if (!this.signer) {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_LOCKED, 'Private key signer is locked');
        }

        return this.signer;
    }

    private signerFromInput(input: ProviderResolveInput): NDKPrivateKeySigner {
        if (input.credential) {
            const parsed = parseCredential(input.credential);
            if (parsed.kind === 'nsec') {
                return new NDKPrivateKeySigner(parsed.privateKeyHex);
            }

            if (parsed.kind === 'hex') {
                return new NDKPrivateKeySigner(parsed.hex);
            }

            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT, 'Credential is not valid for nsec login');
        }

        if (input.ncryptsec && input.passphrase) {
            return new NDKPrivateKeySigner(decryptPrivateKeyFromNcryptsec(input.ncryptsec, input.passphrase));
        }

        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
            'Missing nsec credential or ncryptsec + passphrase payload'
        );
    }

    async resolveSession(input: ProviderResolveInput): Promise<ProviderResolvedSession> {
        this.signer = this.signerFromInput(input);

        return {
            method: this.method,
            pubkey: this.signer.pubkey,
            readonly: false,
            locked: false,
            capabilities: this.supports,
        };
    }

    async signEvent(event: UnsignedNostrEvent): Promise<NostrEvent> {
        const signer = this.requireSigner();

        const eventWithPubkey = {
            ...event,
            pubkey: signer.pubkey,
        };

        const id = getEventHash(eventWithPubkey as any);
        const sig = await signer.sign({ ...(eventWithPubkey as any), id } as any);

        return {
            ...eventWithPubkey,
            id,
            sig,
        };
    }

    async encrypt(pubkey: string, plaintext: string, scheme: EncryptionScheme = 'nip44'): Promise<string> {
        const signer = this.requireSigner();
        const recipient = new NDKUser({ pubkey });
        return signer.encrypt(recipient, plaintext, scheme);
    }

    async decrypt(pubkey: string, ciphertext: string, scheme: EncryptionScheme = 'nip44'): Promise<string> {
        const signer = this.requireSigner();
        const sender = new NDKUser({ pubkey });
        return signer.decrypt(sender, ciphertext, scheme);
    }

    async lock(): Promise<void> {
        this.signer = undefined;
    }
}
