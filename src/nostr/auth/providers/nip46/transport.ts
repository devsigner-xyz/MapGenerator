export interface Nip46TransportEvent {
    kind: number;
    pubkey: string;
    tags: string[][];
    content: string;
    created_at: number;
    id?: string;
    sig?: string;
}

export interface Nip46TransportIo {
    publish(event: Nip46TransportEvent): Promise<void>;
    subscribe(handler: (event: Nip46TransportEvent) => void): () => void;
}

interface Nip46TransportOptions {
    localPubkey: string;
    remoteSignerPubkey: string;
    timeoutMs?: number;
    now?: () => number;
    classifyResponse: (event: Nip46TransportEvent) => Promise<string | undefined> | string | undefined;
}

interface SendRequestInput {
    requestId: string;
    content: string;
}

interface PendingRequest {
    resolve: (event: Nip46TransportEvent) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 12_000;

function hasPTagForPubkey(event: Nip46TransportEvent, pubkey: string): boolean {
    return event.tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey);
}

export function createNip46Transport(io: Nip46TransportIo, options: Nip46TransportOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const pending = new Map<string, PendingRequest>();

    const unsubscribe = io.subscribe(async (event) => {
        if (event.kind !== 24133) {
            return;
        }

        if (event.pubkey !== options.remoteSignerPubkey) {
            return;
        }

        if (!hasPTagForPubkey(event, options.localPubkey)) {
            return;
        }

        let responseId: string | undefined;
        try {
            responseId = await options.classifyResponse(event);
        } catch {
            return;
        }

        if (!responseId) {
            return;
        }

        const pendingRequest = pending.get(responseId);
        if (!pendingRequest) {
            return;
        }

        clearTimeout(pendingRequest.timeoutId);
        pending.delete(responseId);
        pendingRequest.resolve(event);
    });

    return {
        async sendRequest(input: SendRequestInput): Promise<Nip46TransportEvent> {
            if (pending.has(input.requestId)) {
                throw new Error(`Duplicate pending NIP-46 request id: ${input.requestId}`);
            }

            return new Promise<Nip46TransportEvent>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    pending.delete(input.requestId);
                    reject(new Error('NIP-46 request timed out'));
                }, timeoutMs);

                pending.set(input.requestId, { resolve, reject, timeoutId });

                void io
                    .publish({
                        kind: 24133,
                        pubkey: options.localPubkey,
                        tags: [['p', options.remoteSignerPubkey]],
                        content: input.content,
                        created_at: now(),
                    })
                    .catch((error) => {
                        const request = pending.get(input.requestId);
                        if (!request) {
                            return;
                        }

                        clearTimeout(request.timeoutId);
                        pending.delete(input.requestId);
                        reject(error instanceof Error ? error : new Error('Failed to publish NIP-46 request'));
                    });
            });
        },

        close(): void {
            unsubscribe();

            for (const [requestId, request] of pending.entries()) {
                clearTimeout(request.timeoutId);
                request.reject(new Error('NIP-46 transport closed'));
                pending.delete(requestId);
            }
        },
    };
}
