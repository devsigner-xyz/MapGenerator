import { createDmService } from './dm-service';
import type { DmTransport } from './dm-transport';
import { resolveRelayTargetsByTier } from './dm-transport-ndk';
import { createLazyNdkDmTransport } from './lazy-ndk-client';
import { getBootstrapRelays } from './relay-policy';
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

function resolveRuntimeDirectMessageRelays(): { inbox: string[]; outbox: string[] } {
    const settings = loadRelaySettings();
    const fallback = settings.relays.length > 0 ? settings.relays : getBootstrapRelays();
    const inbox = getRelaySetByType(settings, 'dmInbox');
    const outbox = getRelaySetByType(settings, 'dmOutbox');

    return {
        inbox: inbox.length > 0 ? inbox : fallback,
        outbox: outbox.length > 0 ? outbox : fallback,
    };
}

function normalizeRuntimeRelays(value: string[] | { inbox: string[]; outbox: string[] }): { inbox: string[]; outbox: string[] } {
    if (Array.isArray(value)) {
        return {
            inbox: value,
            outbox: value,
        };
    }

    return {
        inbox: value.inbox,
        outbox: value.outbox,
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
        async loadInitialConversations(input: { ownerPubkey: string; sentIndex?: SentIndexItem[] }) {
            if (!dmService.fetchGlobalBackfill) {
                return [];
            }

            return dmService.fetchGlobalBackfill({
                ownerPubkey: input.ownerPubkey,
                mode: 'session_start',
                sentIndex: input.sentIndex ?? [],
            });
        },
        async loadConversationMessages(input: {
            ownerPubkey: string;
            peerPubkey: string;
            since?: number;
            sentIndex?: SentIndexItem[];
        }) {
            if (!dmService.fetchConversationBackfill) {
                return [];
            }

            return dmService.fetchConversationBackfill({
                ownerPubkey: input.ownerPubkey,
                peerPubkey: input.peerPubkey,
                mode: 'session_start',
                since: input.since,
                sentIndex: input.sentIndex ?? [],
            });
        },
    };
}
