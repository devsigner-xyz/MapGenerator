import type { NostrEvent } from '../../types';
import { parseCredential } from '../credentials';
import { capabilitiesForMethod, AUTH_PROVIDER_ERROR, AuthProviderError, type AuthProvider, type ProviderResolveInput, type ProviderResolvedSession, type UnsignedNostrEvent } from './types';

export class NpubAuthProvider implements AuthProvider {
    method = 'npub' as const;
    supports = capabilitiesForMethod(this.method);

    async resolveSession(input: ProviderResolveInput): Promise<ProviderResolvedSession> {
        if (!input.credential) {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT, 'Missing credential for npub login');
        }

        const parsed = parseCredential(input.credential);
        if (parsed.kind !== 'npub' && parsed.kind !== 'hex') {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT, 'Credential is not a public identifier');
        }

        return {
            method: this.method,
            pubkey: parsed.kind === 'npub' ? parsed.pubkeyHex : parsed.hex,
            readonly: true,
            locked: false,
            capabilities: this.supports,
        };
    }

    async signEvent(_event: UnsignedNostrEvent): Promise<NostrEvent> {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_READONLY, 'Cannot sign events in readonly mode');
    }

    async encrypt(_pubkey: string, _plaintext: string): Promise<string> {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_READONLY, 'Cannot encrypt in readonly mode');
    }

    async decrypt(_pubkey: string, _ciphertext: string): Promise<string> {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_READONLY, 'Cannot decrypt in readonly mode');
    }

    async lock(): Promise<void> {
        return;
    }
}
