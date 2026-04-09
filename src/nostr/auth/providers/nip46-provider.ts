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

export class Nip46AuthProvider implements AuthProvider {
    method = 'nip46' as const;
    supports = capabilitiesForMethod(this.method);

    isEnabled(): boolean {
        return false;
    }

    async resolveSession(_input: ProviderResolveInput): Promise<ProviderResolvedSession> {
        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
            'NIP-46 provider is not enabled yet'
        );
    }

    async signEvent(_event: UnsignedNostrEvent): Promise<NostrEvent> {
        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
            'NIP-46 signing is not enabled yet'
        );
    }

    async encrypt(_pubkey: string, _plaintext: string, _scheme?: EncryptionScheme): Promise<string> {
        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
            'NIP-46 encryption is not enabled yet'
        );
    }

    async decrypt(_pubkey: string, _ciphertext: string, _scheme?: EncryptionScheme): Promise<string> {
        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
            'NIP-46 decryption is not enabled yet'
        );
    }

    async lock(): Promise<void> {
        return;
    }
}
