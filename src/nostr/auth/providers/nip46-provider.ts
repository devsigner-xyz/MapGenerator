import { normalizeRelayUrl } from '../../relay-policy';
import type { NostrEvent } from '../../types';
import type { EncryptionScheme, SessionCapabilities } from '../session';
import { createNip46ResponseClassifier, createNip46RpcClient, type Nip46RpcResponse } from './nip46/rpc';
import type { Nip46Cipher } from './nip46/crypto';
import {
    capabilitiesFromNip46Permissions,
    isNip46CallAllowed,
    parseNip46Permissions,
    type Nip46Permission,
} from './nip46/permissions';
import { createNip46Transport, type Nip46TransportIo } from './nip46/transport';
import { parseNip46Uri, type ParsedNip46Uri } from './nip46/uri';
import {
    AUTH_PROVIDER_ERROR,
    AuthProviderError,
    capabilitiesForMethod,
    type AuthProvider,
    type ProviderResolveInput,
    type ProviderResolvedSession,
    type UnsignedNostrEvent,
} from './types';

export interface Nip46Runtime {
    localPubkey: string;
    remoteSignerPubkey: string;
    transport: Nip46TransportIo;
    cipher: Nip46Cipher;
    close?: () => Promise<void> | void;
}

export interface Nip46RuntimeFactoryInput {
    parsedUri: ParsedNip46Uri;
}

export type Nip46RuntimeFactory = (input: Nip46RuntimeFactoryInput) => Promise<Nip46Runtime>;

interface Nip46AuthProviderOptions {
    createRuntime?: Nip46RuntimeFactory;
    timeoutMs?: number;
    now?: () => number;
    makeRequestId?: () => string;
}

interface ActiveNip46Session {
    pubkey: string;
    permissions: Nip46Permission[];
    capabilities: SessionCapabilities;
    callRpc: (method: string, params?: string[]) => Promise<Nip46RpcResponse>;
    close: () => Promise<void>;
}

function normalizeHexPubkey(pubkey: string): string {
    const normalized = pubkey.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT, 'NIP-46 pubkey response is invalid');
    }

    return normalized;
}

function parseRelayList(result?: string): string[] | null {
    if (result === undefined || result === null) {
        return null;
    }

    try {
        const parsed = JSON.parse(result) as unknown;
        if (parsed === null) {
            return null;
        }

        if (!Array.isArray(parsed)) {
            return null;
        }

        const normalized = parsed
            .filter((value): value is string => typeof value === 'string')
            .map((relay) => normalizeRelayUrl(relay))
            .filter((relay): relay is string => relay !== null);

        return [...new Set(normalized)];
    } catch {
        return null;
    }
}

function throwOnRpcError(response: Nip46RpcResponse, method: string): void {
    if (!response.error) {
        return;
    }

    throw new AuthProviderError(
        AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
        `NIP-46 ${method} failed: ${response.error}`
    );
}

function ensureSignedEventShape(event: NostrEvent, expectedPubkey: string): void {
    if (!/^[a-f0-9]{64}$/.test(event.id)) {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE, 'NIP-46 signer returned invalid event id');
    }
    if (!event.sig || !/^[a-f0-9]{128}$/.test(event.sig)) {
        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
            'NIP-46 signer returned invalid event signature'
        );
    }
    if (event.pubkey !== expectedPubkey) {
        throw new AuthProviderError(
            AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
            'NIP-46 signer pubkey does not match user pubkey'
        );
    }
}

export class Nip46AuthProvider implements AuthProvider {
    method = 'nip46' as const;
    supports = capabilitiesForMethod(this.method);

    private readonly createRuntime?: Nip46RuntimeFactory;
    private readonly timeoutMs: number;
    private readonly now: () => number;
    private readonly makeRequestId?: () => string;
    private requestCounter = 0;
    private activeSession: ActiveNip46Session | undefined;

    constructor(options: Nip46AuthProviderOptions = {}) {
        this.createRuntime = options.createRuntime;
        this.timeoutMs = options.timeoutMs ?? 12_000;
        this.now = options.now ?? (() => Date.now());
        this.makeRequestId = options.makeRequestId;
    }

    isEnabled(): boolean {
        return typeof this.createRuntime === 'function';
    }

    private nextRequestId(): string {
        if (this.makeRequestId) {
            return this.makeRequestId();
        }

        this.requestCounter += 1;
        return `nip46-${this.now().toString(36)}-${this.requestCounter}`;
    }

    private requireActiveSession(): ActiveNip46Session {
        if (!this.activeSession) {
            throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_LOCKED, 'NIP-46 session is not initialized');
        }

        return this.activeSession;
    }

    private assertPermission(permissions: Nip46Permission[], method: string, constraint?: string): void {
        if (!isNip46CallAllowed(permissions, method, constraint)) {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_READONLY,
                `NIP-46 permission denied for method ${method}${constraint ? `:${constraint}` : ''}`
            );
        }
    }

    private buildConnectParams(parsedUri: ParsedNip46Uri, remoteSignerPubkey: string): string[] {
        const params: string[] = [remoteSignerPubkey];
        const requestedPerms = parsedUri.type === 'nostrconnect' && parsedUri.perms.length > 0
            ? parsedUri.perms.join(',')
            : undefined;

        if (parsedUri.secret) {
            params.push(parsedUri.secret);
        }

        if (requestedPerms) {
            params.push(requestedPerms);
        }

        return params;
    }

    private validateConnectResult(parsedUri: ParsedNip46Uri, response: Nip46RpcResponse): void {
        throwOnRpcError(response, 'connect');

        if (parsedUri.type !== 'nostrconnect') {
            return;
        }

        if (response.result !== parsedUri.secret) {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
                'NIP-46 connect secret mismatch for nostrconnect flow'
            );
        }
    }

    async resolveSession(input: ProviderResolveInput): Promise<ProviderResolvedSession> {
        if (!this.createRuntime) {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
                'NIP-46 provider is not enabled yet'
            );
        }

        if (!input.bunkerUri) {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_INVALID_INPUT,
                'Missing bunker URI for NIP-46 login'
            );
        }

        const parsedUri = parseNip46Uri(input.bunkerUri);
        const runtime = await this.createRuntime({ parsedUri });

        const transport = createNip46Transport(runtime.transport, {
            localPubkey: runtime.localPubkey,
            remoteSignerPubkey: runtime.remoteSignerPubkey,
            timeoutMs: this.timeoutMs,
            now: () => Math.floor(this.now() / 1000),
            classifyResponse: createNip46ResponseClassifier((ciphertext) => runtime.cipher.decrypt(ciphertext)),
        });

        const rpc = createNip46RpcClient({
            transport,
            cipher: runtime.cipher,
        });

        try {
            const connectResponse = await rpc.call({
                id: this.nextRequestId(),
                method: 'connect',
                params: this.buildConnectParams(parsedUri, runtime.remoteSignerPubkey),
            });
            this.validateConnectResult(parsedUri, connectResponse);

            const userPubkeyResponse = await rpc.call({
                id: this.nextRequestId(),
                method: 'get_public_key',
                params: [],
            });
            throwOnRpcError(userPubkeyResponse, 'get_public_key');

            const userPubkey = normalizeHexPubkey(userPubkeyResponse.result ?? '');

            const switchRelaysResponse = await rpc.call({
                id: this.nextRequestId(),
                method: 'switch_relays',
                params: [],
            });
            throwOnRpcError(switchRelaysResponse, 'switch_relays');

            const switchedRelays = parseRelayList(switchRelaysResponse.result);
            const effectiveRelays = switchedRelays ?? parsedUri.relays;

            const permissionTokens = parsedUri.type === 'nostrconnect' ? parsedUri.perms : [];
            const permissions = parseNip46Permissions(permissionTokens);
            const capabilities = capabilitiesFromNip46Permissions(permissionTokens);
            this.supports = capabilities;

            this.activeSession = {
                pubkey: userPubkey,
                permissions,
                capabilities,
                callRpc: async (method: string, params: string[] = []) => {
                    return rpc.call({
                        id: this.nextRequestId(),
                        method,
                        params,
                    });
                },
                close: async () => {
                    transport.close();
                    await runtime.close?.();
                },
            };

            return {
                method: this.method,
                pubkey: userPubkey,
                readonly: !capabilities.canSign,
                locked: false,
                capabilities,
                metadata: {
                    remoteSignerPubkey: runtime.remoteSignerPubkey,
                    relays: JSON.stringify(effectiveRelays),
                },
            };
        } catch (error) {
            transport.close();
            await runtime.close?.();
            if (error instanceof AuthProviderError) {
                throw error;
            }

            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
                error instanceof Error ? error.message : 'NIP-46 session setup failed'
            );
        }
    }

    async signEvent(event: UnsignedNostrEvent): Promise<NostrEvent> {
        const session = this.requireActiveSession();
        this.assertPermission(session.permissions, 'sign_event', String(event.kind));

        const response = await session.callRpc('sign_event', [JSON.stringify(event)]);
        throwOnRpcError(response, 'sign_event');

        if (!response.result) {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
                'NIP-46 signer returned empty sign_event result'
            );
        }

        let signed: NostrEvent;
        try {
            signed = JSON.parse(response.result) as NostrEvent;
        } catch {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
                'NIP-46 signer returned malformed signed event payload'
            );
        }

        ensureSignedEventShape(signed, session.pubkey);
        return signed;
    }

    async encrypt(pubkey: string, plaintext: string, scheme: EncryptionScheme = 'nip44'): Promise<string> {
        const session = this.requireActiveSession();
        const method = scheme === 'nip04' ? 'nip04_encrypt' : 'nip44_encrypt';
        this.assertPermission(session.permissions, method);

        const response = await session.callRpc(method, [pubkey, plaintext]);
        throwOnRpcError(response, method);

        if (response.result === undefined) {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
                `NIP-46 ${method} returned empty result`
            );
        }

        return response.result;
    }

    async decrypt(pubkey: string, ciphertext: string, scheme: EncryptionScheme = 'nip44'): Promise<string> {
        const session = this.requireActiveSession();
        const method = scheme === 'nip04' ? 'nip04_decrypt' : 'nip44_decrypt';
        this.assertPermission(session.permissions, method);

        const response = await session.callRpc(method, [pubkey, ciphertext]);
        throwOnRpcError(response, method);

        if (response.result === undefined) {
            throw new AuthProviderError(
                AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE,
                `NIP-46 ${method} returned empty result`
            );
        }

        return response.result;
    }

    async lock(): Promise<void> {
        if (!this.activeSession) {
            return;
        }

        const active = this.activeSession;
        this.activeSession = undefined;
        this.supports = capabilitiesForMethod(this.method);
        await active.close();
    }
}
