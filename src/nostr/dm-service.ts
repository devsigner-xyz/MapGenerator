import type { UnsignedNostrEvent } from './auth/providers/types';
import type { DmTransport, PublishResult } from './dm-transport';
import type { RelayTierSelection } from './dm-transport-ndk';
import { isPublishResultSuccessful } from './dm-transport-ndk';
import { getSinglePTag, hashContent, parseEventFromJson } from './dm-service-crypto';
import type { NostrEvent } from './types';

type MessageDirection = 'incoming' | 'outgoing';
type DeliveryState = 'pending' | 'sent' | 'failed';

export interface DmMessage {
    id: string;
    clientMessageId: string;
    conversationId: string;
    peerPubkey: string;
    direction: MessageDirection;
    createdAt: number;
    plaintext: string;
    eventId?: string;
    giftWrapEventId?: string;
    sealEventId?: string;
    rumorEventId?: string;
    deliveryState: DeliveryState;
    isUndecryptable?: boolean;
}

interface ParseGiftWrapContext {
    ownerPubkey: string;
    peerPubkey: string;
}

interface SubscribeInboxInput {
    ownerPubkey: string;
}

interface FetchConversationBackfillInput extends ParseGiftWrapContext {
    mode?: 'session_start' | 'reconnect';
    since?: number;
    sentIndex?: SentIndexItem[];
}

interface FetchGlobalBackfillInput {
    ownerPubkey: string;
    mode?: 'session_start' | 'reconnect';
    since?: number;
    sentIndex?: SentIndexItem[];
}

interface SendDmInput extends ParseGiftWrapContext {
    plaintext: string;
    clientMessageId: string;
    relaySelection: RelayTierSelection;
    targetRelays: string[];
}

interface SendDmResult extends DmMessage {
    publishResult: PublishResult;
    attempts: number;
}

export interface SentIndexItem {
    clientMessageId: string;
    conversationId: string;
    rumorEventId?: string;
    sealEventId?: string;
    giftWrapEventId?: string;
    createdAtSec: number;
    deliveryState: DeliveryState;
    targetRelays: string[];
    plaintext?: string;
}

interface WriteGatewayLike {
    publishEvent: (event: UnsignedNostrEvent) => Promise<NostrEvent>;
    encryptDm: (pubkey: string, plaintext: string) => Promise<string>;
    decryptDm: (pubkey: string, ciphertext: string, scheme?: 'nip04' | 'nip44') => Promise<string>;
}

interface DmServiceDependencies {
    transport: DmTransport;
    writeGateway: WriteGatewayLike;
    verifyEvent?: (event: NostrEvent) => boolean;
    now?: () => number;
    wait?: (ms: number) => Promise<void>;
}

function buildMessageIdentity(message: DmMessage): string {
    if (message.rumorEventId) {
        return `rumor:${message.rumorEventId}`;
    }

    if (message.sealEventId) {
        return `seal:${message.sealEventId}`;
    }

    return hashContent(message.plaintext);
}

function compareMessageOrder(left: DmMessage, right: DmMessage): number {
    if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
    }

    const leftRumorId = left.rumorEventId ?? '~';
    const rightRumorId = right.rumorEventId ?? '~';
    return leftRumorId.localeCompare(rightRumorId);
}

function buildMessageId(message: {
    rumorEventId?: string;
    sealEventId?: string;
    giftWrapEventId?: string;
    clientMessageId: string;
    plaintext: string;
}): string {
    if (message.rumorEventId) {
        return message.rumorEventId;
    }

    if (message.sealEventId) {
        return message.sealEventId;
    }

    if (message.giftWrapEventId) {
        return message.giftWrapEventId;
    }

    if (message.clientMessageId) {
        return `client:${message.clientMessageId}`;
    }

    return hashContent(message.plaintext);
}

function clampToEpochSeconds(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

export function createDmService(dependencies: DmServiceDependencies) {
    const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));
    const verifyEvent = dependencies.verifyEvent ?? (() => true);
    const wait = dependencies.wait ?? (async (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

    async function parseGiftWrapEventInternal(
        giftWrapEvent: NostrEvent,
        context: ParseGiftWrapContext,
        options: {
            requireGiftWrapRecipientOwner: boolean;
        }
    ): Promise<DmMessage | null> {
        const parsed = await parseHistoricalEventForOwner(giftWrapEvent, {
            ownerPubkey: context.ownerPubkey,
            requireGiftWrapRecipientOwner: options.requireGiftWrapRecipientOwner,
        });
        if (!parsed || parsed.peerPubkey !== context.peerPubkey) {
            return null;
        }

        return parsed;
    }

    async function parseGiftWrapEventForOwner(
        giftWrapEvent: NostrEvent,
        input: {
            ownerPubkey: string;
            requireGiftWrapRecipientOwner: boolean;
        }
    ): Promise<DmMessage | null> {
        if (giftWrapEvent.kind !== 1059) {
            return null;
        }

        const giftWrapPTag = getSinglePTag(giftWrapEvent.tags);
        if (input.requireGiftWrapRecipientOwner && giftWrapPTag !== input.ownerPubkey) {
            return null;
        }

        if (!verifyEvent(giftWrapEvent)) {
            return null;
        }

        const sealContent = await dependencies.writeGateway.decryptDm(giftWrapEvent.pubkey, giftWrapEvent.content);
        const sealEvent = parseEventFromJson(sealContent);
        if (!sealEvent || sealEvent.kind !== 13 || !verifyEvent(sealEvent)) {
            return null;
        }

        const rumorContent = await dependencies.writeGateway.decryptDm(sealEvent.pubkey, sealEvent.content);
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

        let peerPubkey: string;
        let direction: MessageDirection;
        if (rumorEvent.pubkey === input.ownerPubkey && rumorRecipient !== input.ownerPubkey) {
            direction = 'outgoing';
            peerPubkey = rumorRecipient;
        } else if (rumorRecipient === input.ownerPubkey && rumorEvent.pubkey !== input.ownerPubkey) {
            direction = 'incoming';
            peerPubkey = rumorEvent.pubkey;
        } else {
            return null;
        }

        const message: DmMessage = {
            id: buildMessageId({
                rumorEventId: rumorEvent.id,
                sealEventId: sealEvent.id,
                giftWrapEventId: giftWrapEvent.id,
                clientMessageId: '',
                plaintext: rumorEvent.content,
            }),
            clientMessageId: '',
            conversationId: peerPubkey,
            peerPubkey,
            direction,
            createdAt: rumorEvent.created_at,
            plaintext: rumorEvent.content,
            eventId: giftWrapEvent.id,
            giftWrapEventId: giftWrapEvent.id,
            sealEventId: sealEvent.id,
            rumorEventId: rumorEvent.id,
            deliveryState: 'sent',
        };

        return message;
    }

    async function parseKind4EventForOwner(
        event: NostrEvent,
        input: {
            ownerPubkey: string;
        }
    ): Promise<DmMessage | null> {
        if (event.kind !== 4) {
            return null;
        }

        if (!verifyEvent(event)) {
            return null;
        }

        const recipient = getSinglePTag(event.tags);
        if (!recipient) {
            return null;
        }

        let direction: MessageDirection;
        let peerPubkey: string;
        if (event.pubkey === input.ownerPubkey && recipient !== input.ownerPubkey) {
            direction = 'outgoing';
            peerPubkey = recipient;
        } else if (recipient === input.ownerPubkey && event.pubkey !== input.ownerPubkey) {
            direction = 'incoming';
            peerPubkey = event.pubkey;
        } else {
            return null;
        }

        try {
            const plaintext = await dependencies.writeGateway.decryptDm(peerPubkey, event.content, 'nip04');
            return {
                id: event.id,
                clientMessageId: '',
                conversationId: peerPubkey,
                peerPubkey,
                direction,
                createdAt: event.created_at,
                plaintext,
                eventId: event.id,
                deliveryState: 'sent',
            };
        } catch {
            return {
                id: event.id,
                clientMessageId: '',
                conversationId: peerPubkey,
                peerPubkey,
                direction,
                createdAt: event.created_at,
                plaintext: '[No se pudo desencriptar este mensaje]',
                eventId: event.id,
                deliveryState: 'sent',
                isUndecryptable: true,
            };
        }
    }

    async function parseHistoricalEventForOwner(
        event: NostrEvent,
        input: {
            ownerPubkey: string;
            requireGiftWrapRecipientOwner: boolean;
        }
    ): Promise<DmMessage | null> {
        if (event.kind === 1059) {
            return parseGiftWrapEventForOwner(event, input);
        }

        if (event.kind === 4) {
            return parseKind4EventForOwner(event, {
                ownerPubkey: input.ownerPubkey,
            });
        }

        return null;
    }

    async function parseGiftWrapEvent(giftWrapEvent: NostrEvent, context: ParseGiftWrapContext): Promise<DmMessage | null> {
        return parseGiftWrapEventInternal(giftWrapEvent, context, {
            requireGiftWrapRecipientOwner: true,
        });
    }

    async function consumeGiftWrapEvent(
        giftWrapEvent: NostrEvent,
        context: ParseGiftWrapContext,
        onMessage: (message: DmMessage) => void
    ): Promise<DmMessage | null> {
        const parsed = await parseGiftWrapEvent(giftWrapEvent, context);
        if (!parsed) {
            return null;
        }

        onMessage(parsed);
        return parsed;
    }

    function mergeConversationMessages(existing: DmMessage[], incoming: DmMessage[]): DmMessage[] {
        const deduped = new Map<string, DmMessage>();
        for (const message of [...existing, ...incoming]) {
            const key = buildMessageIdentity(message);
            if (!deduped.has(key)) {
                deduped.set(key, message);
            }
        }

        return [...deduped.values()].sort(compareMessageOrder);
    }

    function resolveBackfillSince(mode: 'session_start' | 'reconnect'): number {
        const nowSec = clampToEpochSeconds(now());
        if (mode === 'reconnect') {
            return Math.max(0, nowSec - (15 * 60));
        }

        return Math.max(0, nowSec - (7 * 24 * 60 * 60));
    }

    async function sendDm(input: SendDmInput): Promise<SendDmResult> {
        const rumorEvent = await dependencies.writeGateway.publishEvent({
            kind: 14,
            content: input.plaintext,
            created_at: now(),
            tags: buildRumorTags(input.peerPubkey),
        });

        const sealCiphertext = await dependencies.writeGateway.encryptDm(input.peerPubkey, JSON.stringify(rumorEvent));
        const sealEvent = await dependencies.writeGateway.publishEvent({
            kind: 13,
            content: sealCiphertext,
            created_at: now(),
            tags: [],
        });

        const giftWrapCiphertext = await dependencies.writeGateway.encryptDm(input.peerPubkey, JSON.stringify(sealEvent));
        const giftWrapEvent = await dependencies.writeGateway.publishEvent({
            kind: 1059,
            content: giftWrapCiphertext,
            created_at: now(),
            tags: buildGiftWrapTags(input.peerPubkey),
        });

        const delays = [500, 1500];
        const maxAttempts = 3;
        let attempt = 0;
        let lastPublishResult: PublishResult = {
            ackedRelays: [],
            failedRelays: [],
            timeoutRelays: [],
        };

        while (attempt < maxAttempts) {
            attempt += 1;
            lastPublishResult = await dependencies.transport.publishToRelays(giftWrapEvent, input.targetRelays);
            if (isPublishResultSuccessful(lastPublishResult, input.relaySelection)) {
                return {
                    id: buildMessageId({
                        rumorEventId: rumorEvent.id,
                        sealEventId: sealEvent.id,
                        giftWrapEventId: giftWrapEvent.id,
                        clientMessageId: input.clientMessageId,
                        plaintext: input.plaintext,
                    }),
                    clientMessageId: input.clientMessageId,
                    conversationId: input.peerPubkey,
                    peerPubkey: input.peerPubkey,
                    direction: 'outgoing',
                    createdAt: rumorEvent.created_at,
                    plaintext: input.plaintext,
                    eventId: giftWrapEvent.id,
                    giftWrapEventId: giftWrapEvent.id,
                    sealEventId: sealEvent.id,
                    rumorEventId: rumorEvent.id,
                    deliveryState: 'sent',
                    publishResult: lastPublishResult,
                    attempts: attempt,
                };
            }

            if (attempt < maxAttempts) {
                await wait(delays[attempt - 1]);
            }
        }

        return {
            id: buildMessageId({
                rumorEventId: rumorEvent.id,
                sealEventId: sealEvent.id,
                giftWrapEventId: giftWrapEvent.id,
                clientMessageId: input.clientMessageId,
                plaintext: input.plaintext,
            }),
            clientMessageId: input.clientMessageId,
            conversationId: input.peerPubkey,
            peerPubkey: input.peerPubkey,
            direction: 'outgoing',
            createdAt: rumorEvent.created_at,
            plaintext: input.plaintext,
            eventId: giftWrapEvent.id,
            giftWrapEventId: giftWrapEvent.id,
            sealEventId: sealEvent.id,
            rumorEventId: rumorEvent.id,
            deliveryState: 'failed',
            publishResult: lastPublishResult,
            attempts: maxAttempts,
        };
    }

    function subscribeInbox(input: SubscribeInboxInput, onMessage: (message: DmMessage) => void): () => void {
        const subscription = dependencies.transport.subscribe(
            [
                {
                    kinds: [1059, 4],
                    '#p': [input.ownerPubkey],
                },
            ],
            (event) => {
                void (async () => {
                    const message = await parseHistoricalEventForOwner(event, {
                        ownerPubkey: input.ownerPubkey,
                        requireGiftWrapRecipientOwner: true,
                    });

                    if (message) {
                        onMessage(message);
                    }
                })();
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }

    async function fetchConversationBackfill(input: FetchConversationBackfillInput): Promise<DmMessage[]> {
        const since = input.since ?? resolveBackfillSince(input.mode ?? 'session_start');
        const inboxFilters = [
            {
                kinds: [1059, 4],
                '#p': [input.ownerPubkey],
                since,
            },
        ];

        const outgoingRelayFilters = [
            {
                kinds: [1059, 4],
                '#p': [input.peerPubkey],
                since,
            },
        ];

        const [inboxEvents, relayOutgoingEvents] = await Promise.all([
            dependencies.transport.fetchBackfill(inboxFilters),
            dependencies.transport.fetchBackfill(outgoingRelayFilters),
        ]);

        const parsedInbox: DmMessage[] = [];
        for (const currentEvent of inboxEvents) {
            const message = await parseGiftWrapEventInternal(currentEvent, {
                ownerPubkey: input.ownerPubkey,
                peerPubkey: input.peerPubkey,
            }, {
                requireGiftWrapRecipientOwner: true,
            });

            if (message) {
                parsedInbox.push(message);
            }
        }

        const parsedRelayOutgoing: DmMessage[] = [];
        for (const currentEvent of relayOutgoingEvents) {
            const message = await parseGiftWrapEventInternal(currentEvent, {
                ownerPubkey: input.ownerPubkey,
                peerPubkey: input.peerPubkey,
            }, {
                requireGiftWrapRecipientOwner: false,
            });

            if (message && message.direction === 'outgoing') {
                parsedRelayOutgoing.push(message);
            }
        }

        const localSentIndexMessages: DmMessage[] = (input.sentIndex ?? [])
            .filter((item) => item.conversationId === input.peerPubkey)
            .map((item) => ({
                id: buildMessageId({
                    rumorEventId: item.rumorEventId,
                    sealEventId: item.sealEventId,
                    giftWrapEventId: item.giftWrapEventId,
                    clientMessageId: item.clientMessageId,
                    plaintext: item.plaintext ?? '',
                }),
                clientMessageId: item.clientMessageId,
                conversationId: input.peerPubkey,
                peerPubkey: input.peerPubkey,
                direction: 'outgoing' as const,
                createdAt: clampToEpochSeconds(item.createdAtSec),
                plaintext: item.plaintext ?? '',
                eventId: item.giftWrapEventId,
                giftWrapEventId: item.giftWrapEventId,
                sealEventId: item.sealEventId,
                rumorEventId: item.rumorEventId,
                deliveryState: item.deliveryState,
            }));

        return mergeConversationMessages([], [...parsedInbox, ...parsedRelayOutgoing, ...localSentIndexMessages]);
    }

    async function fetchGlobalBackfill(input: FetchGlobalBackfillInput): Promise<DmMessage[]> {
        const since = input.since ?? resolveBackfillSince(input.mode ?? 'session_start');
        const inboxFilters = [
            {
                kinds: [1059, 4],
                '#p': [input.ownerPubkey],
                since,
            },
        ];

        const outgoingFilters = [
            {
                kinds: [1059, 4],
                authors: [input.ownerPubkey],
                since,
            },
        ];

        const [inboxEvents, outgoingEvents] = await Promise.all([
            dependencies.transport.fetchBackfill(inboxFilters),
            dependencies.transport.fetchBackfill(outgoingFilters),
        ]);

        const parsedInbox: DmMessage[] = [];
        for (const currentEvent of inboxEvents) {
            const message = await parseHistoricalEventForOwner(currentEvent, {
                ownerPubkey: input.ownerPubkey,
                requireGiftWrapRecipientOwner: true,
            });

            if (message) {
                parsedInbox.push(message);
            }
        }

        const parsedOutgoing: DmMessage[] = [];
        for (const currentEvent of outgoingEvents) {
            const message = await parseHistoricalEventForOwner(currentEvent, {
                ownerPubkey: input.ownerPubkey,
                requireGiftWrapRecipientOwner: false,
            });

            if (message && message.direction === 'outgoing') {
                parsedOutgoing.push(message);
            }
        }

        const localSentIndexMessages: DmMessage[] = (input.sentIndex ?? [])
            .map((item) => ({
                id: buildMessageId({
                    rumorEventId: item.rumorEventId,
                    sealEventId: item.sealEventId,
                    giftWrapEventId: item.giftWrapEventId,
                    clientMessageId: item.clientMessageId,
                    plaintext: item.plaintext ?? '',
                }),
                clientMessageId: item.clientMessageId,
                conversationId: item.conversationId,
                peerPubkey: item.conversationId,
                direction: 'outgoing' as const,
                createdAt: clampToEpochSeconds(item.createdAtSec),
                plaintext: item.plaintext ?? '',
                eventId: item.giftWrapEventId,
                giftWrapEventId: item.giftWrapEventId,
                sealEventId: item.sealEventId,
                rumorEventId: item.rumorEventId,
                deliveryState: item.deliveryState,
            }));

        return mergeConversationMessages([], [...parsedInbox, ...parsedOutgoing, ...localSentIndexMessages]);
    }

    return {
        buildRumorTags,
        buildGiftWrapTags,
        parseGiftWrapEvent,
        consumeGiftWrapEvent,
        mergeConversationMessages,
        resolveBackfillSince,
        sendDm,
        subscribeInbox,
        fetchConversationBackfill,
        fetchGlobalBackfill,
    };
}

export function buildRumorTags(peerPubkey: string): string[][] {
    return [['p', peerPubkey]];
}

export function buildGiftWrapTags(peerPubkey: string): string[][] {
    return [['p', peerPubkey]];
}
