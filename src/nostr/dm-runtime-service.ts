import { createDmService } from './dm-service';
import type { DmTransport } from './dm-transport';
import { resolveRelayTargetsByTier } from './dm-transport-ndk';
import { createLazyNdkDmTransport } from './lazy-ndk-client';
import { getBootstrapRelays, mergeRelaySets } from './relay-policy';
import { getRelaySetByType, loadRelaySettings } from './relay-settings';
import type { SentIndexItem } from './dm-service';

type WriteGatewayLike = {
    publishEvent: (event: {
        kind: number;
        content: string;
        created_at: number;
        tags: string[][];
    }) => Promise<{
        id: string;
        pubkey: string;
        kind: number;
        created_at: number;
        tags: string[][];
        content: string;
    }>;
    encryptDm: (pubkey: string, plaintext: string) => Promise<string>;
    decryptDm: (pubkey: string, ciphertext: string, scheme?: 'nip04' | 'nip44') => Promise<string>;
};

type RuntimeDmCore = Pick<ReturnType<typeof createDmService>, 'subscribeInbox' | 'sendDm'>
    & Partial<Pick<ReturnType<typeof createDmService>, 'fetchGlobalBackfill' | 'fetchConversationBackfill'>>;
type DmFactory = (dependencies: Parameters<typeof createDmService>[0]) => RuntimeDmCore;

interface CreateRuntimeDirectMessagesServiceOptions {
    writeGateway: WriteGatewayLike;
    createDmService?: DmFactory;
    createTransport?: (relays: string[]) => DmTransport;
    resolveRelays?: () => string[] | { inbox: string[]; outbox: string[] };
}

type DmBackfillMode = 'session_start' | 'reconnect';

const RUNTIME_DM_INBOX_RELAY_CAP = 8;
const RUNTIME_DM_OUTBOX_RELAY_CAP = 8;

function capRuntimeRelays(relays: string[], limit: number): string[] {
    const normalized = mergeRelaySets(relays);
    if (normalized.length <= limit) {
        return normalized;
    }

    return normalized.slice(0, limit);
}

function resolveRuntimeDirectMessageRelays(): { inbox: string[]; outbox: string[] } {
    const settings = loadRelaySettings();
    const fallback = settings.relays.length > 0 ? settings.relays : getBootstrapRelays();
    const dmInbox = getRelaySetByType(settings, 'dmInbox');
    const nip65Read = getRelaySetByType(settings, 'nip65Read');
    const nip65Write = getRelaySetByType(settings, 'nip65Write');
    const nip65Both = getRelaySetByType(settings, 'nip65Both');
    const outbox = mergeRelaySets(nip65Write, nip65Both);
    const inboxFallback = mergeRelaySets(nip65Read, nip65Both, fallback);

    return {
        inbox: dmInbox.length > 0 ? dmInbox : inboxFallback,
        outbox: outbox.length > 0 ? outbox : fallback,
    };
}

function normalizeRuntimeRelays(value: string[] | { inbox: string[]; outbox: string[] }): { inbox: string[]; outbox: string[] } {
    if (Array.isArray(value)) {
        const capped = capRuntimeRelays(value, RUNTIME_DM_INBOX_RELAY_CAP);
        return {
            inbox: capped,
            outbox: capRuntimeRelays(value, RUNTIME_DM_OUTBOX_RELAY_CAP),
        };
    }

    return {
        inbox: capRuntimeRelays(value.inbox, RUNTIME_DM_INBOX_RELAY_CAP),
        outbox: capRuntimeRelays(value.outbox, RUNTIME_DM_OUTBOX_RELAY_CAP),
    };
}

export function createRuntimeDirectMessagesService(options: CreateRuntimeDirectMessagesServiceOptions) {
    const resolveRelays = options.resolveRelays ?? resolveRuntimeDirectMessageRelays;
    const createTransport = options.createTransport ?? ((relays: string[]) => createLazyNdkDmTransport({ relays }));
    const createDmServiceFn = options.createDmService ?? createDmService;
    const runtimeRelays = normalizeRuntimeRelays(resolveRelays());
    const dmService = createDmServiceFn({
        transport: createTransport(runtimeRelays.inbox),
        writeGateway: options.writeGateway,
    });

    return {
        subscribeInbox(input: { ownerPubkey: string }, onMessage: (message: Parameters<typeof dmService.subscribeInbox>[1] extends (message: infer T) => void ? T : never) => void) {
            return dmService.subscribeInbox({
                ownerPubkey: input.ownerPubkey,
            }, onMessage);
        },
        async sendDm(input: {
            ownerPubkey: string;
            peerPubkey: string;
            plaintext: string;
            clientMessageId: string;
        }) {
            const relaySelection = resolveRelayTargetsByTier({
                inboxWrite: [],
                read: [],
                session: runtimeRelays.outbox,
            });

            return dmService.sendDm({
                ownerPubkey: input.ownerPubkey,
                peerPubkey: input.peerPubkey,
                plaintext: input.plaintext,
                clientMessageId: input.clientMessageId,
                relaySelection,
                targetRelays: relaySelection.relays,
            });
        },
        async loadInitialConversations(input: {
            ownerPubkey: string;
            sentIndex?: SentIndexItem[];
            mode?: DmBackfillMode;
        }) {
            if (!dmService.fetchGlobalBackfill) {
                return [];
            }

            return dmService.fetchGlobalBackfill({
                ownerPubkey: input.ownerPubkey,
                mode: input.mode ?? 'session_start',
                sentIndex: input.sentIndex ?? [],
            });
        },
        async loadConversationMessages(input: {
            ownerPubkey: string;
            peerPubkey: string;
            since?: number;
            sentIndex?: SentIndexItem[];
            mode?: DmBackfillMode;
        }) {
            if (!dmService.fetchConversationBackfill) {
                return [];
            }

            const backfillInput: Parameters<NonNullable<typeof dmService.fetchConversationBackfill>>[0] = {
                ownerPubkey: input.ownerPubkey,
                peerPubkey: input.peerPubkey,
                mode: input.mode ?? 'session_start',
                sentIndex: input.sentIndex ?? [],
            };
            if (typeof input.since === 'number') {
                backfillInput.since = input.since;
            }

            return dmService.fetchConversationBackfill(backfillInput);
        },
    };
}
