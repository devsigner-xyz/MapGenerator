import { verifyEvent } from 'nostr-tools';
import { getSinglePTag, parseEventFromJson } from '../nostr/dm-service-crypto';
import type { EncryptionScheme } from '../nostr/auth/session';
import type { NostrEvent } from '../nostr/types';
import type { DirectMessageItem, DirectMessagesService } from '../nostr-overlay/query/direct-messages.query';
import { createHttpClient, type HttpClient } from './http-client';

interface DmEventDto {
    id: string;
    sig?: string;
    pubkey: string;
    kind: number;
    createdAt: number;
    content: string;
    tags: string[][];
}

interface DmEventsResponseDto {
    items: DmEventDto[];
    hasMore: boolean;
    nextSince: number | null;
}

interface CreateDmApiServiceOptions {
    client?: HttpClient;
    defaultLimit?: number;
    reconnectDelayMs?: number;
    mapEventToMessage?: (event: DmEventDto, ownerPubkey: string) => DirectMessageItem | null | Promise<DirectMessageItem | null>;
    decryptDm?: (pubkey: string, ciphertext: string, scheme?: EncryptionScheme) => Promise<string>;
    verifyDmEvent?: (event: NostrEvent) => boolean;
    sendDm?: DirectMessagesService['sendDm'];
}

type MaybePromise<T> = T | Promise<T>;

type EventMapper = (
    event: DmEventDto,
    ownerPubkey: string,
) => MaybePromise<DirectMessageItem | null>;

function getTagValue(tags: string[][], key: string): string | null {
    const tag = tags.find((candidate) => Array.isArray(candidate) && candidate[0] === key && typeof candidate[1] === 'string');
    return tag?.[1] ?? null;
}

function toNostrEvent(event: DmEventDto): NostrEvent {
    return {
        id: event.id,
        sig: event.sig,
        pubkey: event.pubkey,
        kind: event.kind,
        created_at: event.createdAt,
        tags: event.tags,
        content: event.content,
    };
}

function shouldVerifyEventSignature(event: NostrEvent): boolean {
    return typeof event.sig === 'string' && event.sig.length > 0;
}

function toUndecryptablePlaceholder(
    event: DmEventDto,
    ownerPubkey: string,
): DirectMessageItem | null {
    if (!event?.id || !event?.pubkey || !Array.isArray(event.tags)) {
        return null;
    }

    const isOutgoing = event.pubkey === ownerPubkey;
    const hintedPeer = getTagValue(event.tags, 'p');
    const peerPubkey = isOutgoing ? (hintedPeer ?? ownerPubkey) : event.pubkey;
    const kind = Number.isFinite(event.kind) ? event.kind : 0;

    return {
        id: event.id,
        clientMessageId: event.id,
        conversationId: peerPubkey,
        peerPubkey,
        direction: isOutgoing ? 'outgoing' : 'incoming',
        createdAt: event.createdAt,
        plaintext: '',
        eventId: event.id,
        giftWrapEventId: kind === 1059 ? event.id : undefined,
        deliveryState: 'sent',
        isUndecryptable: true,
    };
}

async function parseKind4EventForOwner(
    event: DmEventDto,
    ownerPubkey: string,
    decryptDm: (pubkey: string, ciphertext: string, scheme?: EncryptionScheme) => Promise<string>,
    verifyDmEvent: (event: NostrEvent) => boolean,
): Promise<DirectMessageItem | null> {
    if (event.kind !== 4) {
        return null;
    }

    const nostrEvent = toNostrEvent(event);
    if (shouldVerifyEventSignature(nostrEvent) && !verifyDmEvent(nostrEvent)) {
        return null;
    }

    const recipient = getSinglePTag(event.tags);
    if (!recipient) {
        return null;
    }

    let direction: 'incoming' | 'outgoing';
    let peerPubkey: string;
    if (event.pubkey === ownerPubkey && recipient !== ownerPubkey) {
        direction = 'outgoing';
        peerPubkey = recipient;
    } else if (recipient === ownerPubkey && event.pubkey !== ownerPubkey) {
        direction = 'incoming';
        peerPubkey = event.pubkey;
    } else {
        return null;
    }

    try {
        const plaintext = await decryptDm(peerPubkey, event.content, 'nip04');
        return {
            id: event.id,
            clientMessageId: event.id,
            conversationId: peerPubkey,
            peerPubkey,
            direction,
            createdAt: event.createdAt,
            plaintext,
            eventId: event.id,
            deliveryState: 'sent',
        };
    } catch {
        return {
            id: event.id,
            clientMessageId: event.id,
            conversationId: peerPubkey,
            peerPubkey,
            direction,
            createdAt: event.createdAt,
            plaintext: '',
            eventId: event.id,
            deliveryState: 'sent',
            isUndecryptable: true,
        };
    }
}

async function parseGiftWrapEventForOwner(
    event: DmEventDto,
    ownerPubkey: string,
    decryptDm: (pubkey: string, ciphertext: string, scheme?: EncryptionScheme) => Promise<string>,
    verifyDmEvent: (event: NostrEvent) => boolean,
): Promise<DirectMessageItem | null> {
    if (event.kind !== 1059) {
        return null;
    }

    const giftWrapEvent = toNostrEvent(event);
    if (shouldVerifyEventSignature(giftWrapEvent) && !verifyDmEvent(giftWrapEvent)) {
        return null;
    }

    const giftWrapRecipient = getSinglePTag(event.tags);
    if (giftWrapEvent.pubkey !== ownerPubkey && giftWrapRecipient !== ownerPubkey) {
        return null;
    }

    let sealContent: string;
    try {
        sealContent = await decryptDm(giftWrapEvent.pubkey, giftWrapEvent.content, 'nip44');
    } catch {
        return null;
    }

    const sealEvent = parseEventFromJson(sealContent);
    if (
        !sealEvent
        || sealEvent.kind !== 13
        || (shouldVerifyEventSignature(sealEvent) && !verifyDmEvent(sealEvent))
    ) {
        return null;
    }

    let rumorContent: string;
    try {
        rumorContent = await decryptDm(sealEvent.pubkey, sealEvent.content, 'nip44');
    } catch {
        return null;
    }

    const rumorEvent = parseEventFromJson(rumorContent);
    if (!rumorEvent || rumorEvent.kind !== 14) {
        return null;
    }

    if (sealEvent.pubkey !== rumorEvent.pubkey) {
        return null;
    }

    const rumorRecipient = getSinglePTag(rumorEvent.tags);
    if (!rumorRecipient) {
        return null;
    }

    let direction: 'incoming' | 'outgoing';
    let peerPubkey: string;
    if (rumorEvent.pubkey === ownerPubkey && rumorRecipient !== ownerPubkey) {
        direction = 'outgoing';
        peerPubkey = rumorRecipient;
    } else if (rumorRecipient === ownerPubkey && rumorEvent.pubkey !== ownerPubkey) {
        direction = 'incoming';
        peerPubkey = rumorEvent.pubkey;
    } else {
        return null;
    }

    return {
        id: rumorEvent.id,
        clientMessageId: event.id,
        conversationId: peerPubkey,
        peerPubkey,
        direction,
        createdAt: rumorEvent.created_at,
        plaintext: rumorEvent.content,
        eventId: event.id,
        giftWrapEventId: giftWrapEvent.id,
        sealEventId: sealEvent.id,
        rumorEventId: rumorEvent.id,
        deliveryState: 'sent',
    };
}

function parseSseEventData(block: string): string | null {
    const lines = block.split('\n');
    const dataLines = lines
        .map((line) => line.replace(/\r$/, ''))
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
        return null;
    }

    return dataLines.join('\n');
}

function toStreamEvent(payload: unknown): DmEventDto | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const maybeEvent = payload as Partial<DmEventDto>;
    if (
        typeof maybeEvent.id !== 'string'
        || typeof maybeEvent.pubkey !== 'string'
        || typeof maybeEvent.kind !== 'number'
        || typeof maybeEvent.createdAt !== 'number'
        || typeof maybeEvent.content !== 'string'
        || !Array.isArray(maybeEvent.tags)
    ) {
        return null;
    }

    return {
        id: maybeEvent.id,
        pubkey: maybeEvent.pubkey,
        kind: maybeEvent.kind,
        createdAt: maybeEvent.createdAt,
        content: maybeEvent.content,
        tags: maybeEvent.tags as string[][],
    };
}

export function createDmApiService(options: CreateDmApiServiceOptions = {}): DirectMessagesService {
    const client = options.client ?? createHttpClient();
    const defaultLimit = Math.max(1, Math.floor(options.defaultLimit ?? 200));
    const reconnectDelayMs = Math.max(250, Math.floor(options.reconnectDelayMs ?? 1_500));
    const verifyDmEvent = options.verifyDmEvent ?? verifyEvent;

    const mapEventToMessage: EventMapper = options.mapEventToMessage
        ?? (async (event, ownerPubkey) => {
            if (!options.decryptDm) {
                return toUndecryptablePlaceholder(event, ownerPubkey);
            }

            const giftWrapMessage = await parseGiftWrapEventForOwner(
                event,
                ownerPubkey,
                options.decryptDm,
                verifyDmEvent,
            );
            if (giftWrapMessage) {
                return giftWrapMessage;
            }

            const kind4Message = await parseKind4EventForOwner(
                event,
                ownerPubkey,
                options.decryptDm,
                verifyDmEvent,
            );
            if (kind4Message) {
                return kind4Message;
            }

            return toUndecryptablePlaceholder(event, ownerPubkey);
        });

    return {
        subscribeInbox(input, onMessage) {
            let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
            let activeConnectionAbort: AbortController | null = null;
            let active = true;

            const clearReconnectTimer = () => {
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
            };

            const scheduleReconnect = () => {
                if (!active) {
                    return;
                }

                clearReconnectTimer();
                reconnectTimer = setTimeout(() => {
                    void connect();
                }, reconnectDelayMs);
            };

            const connect = async (): Promise<void> => {
                const connectionAbort = new AbortController();
                activeConnectionAbort?.abort();
                activeConnectionAbort = connectionAbort;

                try {
                    const response = await client.requestRaw('GET', '/dm/stream', {
                        includeAuth: true,
                        query: {
                            ownerPubkey: input.ownerPubkey,
                        },
                        timeoutMs: 0,
                        signal: connectionAbort.signal,
                    });

                    const reader = response.body?.getReader();
                    if (!reader) {
                        scheduleReconnect();
                        return;
                    }

                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (active) {
                        const chunk = await reader.read();
                        if (chunk.done) {
                            break;
                        }

                        buffer += decoder.decode(chunk.value, { stream: true });

                        let separatorIndex = buffer.indexOf('\n\n');
                        while (separatorIndex >= 0) {
                            const block = buffer.slice(0, separatorIndex);
                            buffer = buffer.slice(separatorIndex + 2);

                            const data = parseSseEventData(block);
                            if (data) {
                                try {
                                    const parsed = JSON.parse(data);
                                    const event = toStreamEvent(parsed);
                                    if (!event) {
                                        separatorIndex = buffer.indexOf('\n\n');
                                        continue;
                                    }

                                    const mapped = await mapEventToMessage(event, input.ownerPubkey);
                                    if (mapped) {
                                        onMessage(mapped);
                                    }
                                } catch {
                                    // Ignore malformed stream payload chunks.
                                }
                            }

                            separatorIndex = buffer.indexOf('\n\n');
                        }
                    }
                } catch {
                    // Best effort stream: retry while subscription is active.
                } finally {
                    connectionAbort.abort();
                    if (activeConnectionAbort === connectionAbort) {
                        activeConnectionAbort = null;
                    }
                    if (active) {
                        scheduleReconnect();
                    }
                }
            };

            void connect();

            return () => {
                active = false;
                clearReconnectTimer();
                activeConnectionAbort?.abort();
            };
        },

        async loadInitialConversations(input) {
            const now = Math.floor(Date.now() / 1000);
            const response = await client.getJson<DmEventsResponseDto>('/dm/events/inbox', {
                includeAuth: true,
                query: {
                    ownerPubkey: input.ownerPubkey,
                    limit: defaultLimit,
                    since: now,
                },
            });

            const mapped = await Promise.all(
                response.items.map((event) => mapEventToMessage(event, input.ownerPubkey)),
            );

            return mapped.filter((item): item is DirectMessageItem => Boolean(item));
        },

        async loadConversationMessages(input) {
            const response = await client.getJson<DmEventsResponseDto>('/dm/events/conversation', {
                includeAuth: true,
                query: {
                    ownerPubkey: input.ownerPubkey,
                    peerPubkey: input.peerPubkey,
                    limit: defaultLimit,
                    since: input.since ?? Math.floor(Date.now() / 1000),
                },
            });

            const mapped = await Promise.all(
                response.items.map((event) => mapEventToMessage(event, input.ownerPubkey)),
            );

            return mapped.filter((item): item is DirectMessageItem => Boolean(item));
        },

        sendDm: options.sendDm,
    };
}
