import { nip44 } from 'nostr-tools';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
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

function cloneSecretKey(secretKey: Uint8Array): Uint8Array {
    return new Uint8Array(secretKey);
}

export class LocalKeyAuthProvider implements AuthProvider {
    method = 'local' as const;
    supports = capabilitiesForMethod(this.method);
    private activeSecretKey: Uint8Array | undefined;
    private activePubkey: string | undefined;

    private requireSecretKey(): Uint8Array {
        if (!this.activeSecretKey) {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_LOCKED, 'Local key session is locked');
        }

        return this.activeSecretKey;
    }

    async resolveSession(input: ProviderResolveInput): Promise<ProviderResolvedSession> {
        if (!(input.secretKey instanceof Uint8Array) || input.secretKey.length === 0) {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT, 'Missing local secret key');
        }

        if (input.secretKey.length !== 32) {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT, 'Local secret key must be 32 bytes');
        }

        this.activeSecretKey = cloneSecretKey(input.secretKey);

        try {
            this.activePubkey = getPublicKey(this.activeSecretKey);
        } catch {
            this.activeSecretKey.fill(0);
            this.activeSecretKey = undefined;
            this.activePubkey = undefined;
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT, 'Local secret key is not a valid secp256k1 scalar');
        }

        return {
            method: this.method,
            pubkey: this.activePubkey,
            readonly: false,
            locked: false,
            capabilities: this.supports,
        };
    }

    async signEvent(event: UnsignedNostrEvent): Promise<NostrEvent> {
        return finalizeEvent(event, this.requireSecretKey()) as NostrEvent;
    }

    async encrypt(pubkey: string, plaintext: string, scheme: EncryptionScheme = 'nip44'): Promise<string> {
        if (scheme !== 'nip44') {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE, `Local auth provider does not support ${scheme} encryption`);
        }

        const conversationKey = nip44.v2.utils.getConversationKey(this.requireSecretKey(), pubkey);
        return nip44.v2.encrypt(plaintext, conversationKey);
    }

    async decrypt(pubkey: string, ciphertext: string, scheme: EncryptionScheme = 'nip44'): Promise<string> {
        if (scheme !== 'nip44') {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE, `Local auth provider does not support ${scheme} decryption`);
        }

        const conversationKey = nip44.v2.utils.getConversationKey(this.requireSecretKey(), pubkey);
        return nip44.v2.decrypt(ciphertext, conversationKey);
    }

    async lock(): Promise<void> {
        this.activeSecretKey?.fill(0);
        this.activeSecretKey = undefined;
        this.activePubkey = undefined;
    }
}
