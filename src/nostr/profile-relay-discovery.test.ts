import { describe, expect, test, vi } from 'vitest';
import { loadProfileRelaySuggestions } from './profile-relay-discovery';
import type { NostrClient, NostrEvent } from './types';

function event(input: Partial<NostrEvent> & Pick<NostrEvent, 'kind' | 'pubkey' | 'tags'>): NostrEvent {
    return {
        id: `evt-${input.kind}`,
        pubkey: input.pubkey,
        kind: input.kind,
        created_at: 123,
        tags: input.tags,
        content: '',
        ...(input.sig ? { sig: input.sig } : {}),
    };
}

function clientStub(eventsByKind: Record<number, NostrEvent | null | Error>): NostrClient & { connect: ReturnType<typeof vi.fn> } {
    const connect = vi.fn(async () => undefined);
    return {
        connect,
        fetchEvents: vi.fn(async () => []),
        fetchLatestReplaceableEvent: vi.fn(async (_pubkey: string, kind: number) => {
            if (!connect.mock.calls.length) {
                throw new Error('client must be connected before fetching');
            }

            const next = eventsByKind[kind] ?? null;
            if (next instanceof Error) {
                throw next;
            }

            return next;
        }),
    };
}

describe('loadProfileRelaySuggestions', () => {
    test('connects before fetching relay metadata', async () => {
        const pubkey = 'a'.repeat(64);
        const client = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.profile.example']],
            }),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient: client });

        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(result.nip65Both).toEqual(['wss://relay.profile.example']);
        expect(result.nip65Read).toEqual(['wss://relay.profile.example']);
        expect(result.nip65Write).toEqual(['wss://relay.profile.example']);
    });

    test('keeps NIP-65 relays when DM relay metadata fails', async () => {
        const pubkey = 'b'.repeat(64);
        const client = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.read.example', 'read']],
            }),
            10050: new Error('dm relay timeout'),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient: client });

        expect(result.nip65Read).toEqual(['wss://relay.read.example']);
        expect(result.nip65Write).toEqual([]);
        expect(result.dmInbox).toEqual([]);
    });

    test('falls back when the primary client returns no relay metadata', async () => {
        const pubkey = 'c'.repeat(64);
        const primaryClient = clientStub({ 10002: null, 10050: null });
        const fallbackClient = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.fallback.example', 'write']],
            }),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient, fallbackClient });

        expect(primaryClient.connect).toHaveBeenCalledTimes(1);
        expect(fallbackClient.connect).toHaveBeenCalledTimes(1);
        expect(result.nip65Write).toEqual(['wss://relay.fallback.example']);
    });

    test('falls back for NIP-65 relays while keeping primary DM inbox relays', async () => {
        const pubkey = 'e'.repeat(64);
        const primaryClient = clientStub({
            10002: null,
            10050: event({
                pubkey,
                kind: 10050,
                tags: [['relay', 'wss://relay.dm.example']],
            }),
        });
        const fallbackClient = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.fallback.example']],
            }),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient, fallbackClient });

        expect(fallbackClient.connect).toHaveBeenCalledTimes(1);
        expect(result.nip65Both).toEqual(['wss://relay.fallback.example']);
        expect(result.dmInbox).toEqual(['wss://relay.dm.example']);
    });

    test('does not use fallback when primary client returns relay metadata', async () => {
        const pubkey = 'd'.repeat(64);
        const primaryClient = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.primary.example']],
            }),
        });
        const fallbackClient = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.fallback.example']],
            }),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient, fallbackClient });

        expect(result.nip65Both).toEqual(['wss://relay.primary.example']);
        expect(fallbackClient.connect).not.toHaveBeenCalled();
    });
});
