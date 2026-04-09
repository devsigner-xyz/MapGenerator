import { describe, expect, test } from 'vitest';
import { createNip46Transport, type Nip46TransportEvent } from './transport';

function createFakeIo() {
    let handler: ((event: Nip46TransportEvent) => void) | undefined;
    const published: Nip46TransportEvent[] = [];

    return {
        published,
        io: {
            publish: async (event: Nip46TransportEvent) => {
                published.push(event);
            },
            subscribe: (next: (event: Nip46TransportEvent) => void) => {
                handler = next;
                return () => {
                    handler = undefined;
                };
            },
        },
        emit: (event: Nip46TransportEvent) => {
            handler?.(event);
        },
    };
}

describe('createNip46Transport', () => {
    test('publishes request event and resolves matching response id', async () => {
        const fake = createFakeIo();
        const transport = createNip46Transport(fake.io, {
            localPubkey: 'c'.repeat(64),
            remoteSignerPubkey: 'd'.repeat(64),
            timeoutMs: 200,
            now: () => 1714078911,
            classifyResponse: async (event) => {
                try {
                    const parsed = JSON.parse(event.content) as { id?: string };
                    return typeof parsed.id === 'string' ? parsed.id : undefined;
                } catch {
                    return undefined;
                }
            },
        });

        const pending = transport.sendRequest({
            requestId: 'req-1',
            content: 'encrypted-request',
        });

        expect(fake.published).toHaveLength(1);
        expect(fake.published[0]).toMatchObject({
            kind: 24133,
            pubkey: 'c'.repeat(64),
            content: 'encrypted-request',
            tags: [['p', 'd'.repeat(64)]],
            created_at: 1714078911,
        });

        fake.emit({
            kind: 24133,
            pubkey: 'd'.repeat(64),
            tags: [['p', 'c'.repeat(64)]],
            content: JSON.stringify({ id: 'other-id', result: 'ignored' }),
            created_at: 1714078912,
        });

        fake.emit({
            kind: 24133,
            pubkey: 'd'.repeat(64),
            tags: [['p', 'c'.repeat(64)]],
            content: JSON.stringify({ id: 'req-1', result: 'ok' }),
            created_at: 1714078913,
        });

        const response = await pending;
        expect(response.content).toContain('req-1');
        transport.close();
    });

    test('rejects pending request on timeout', async () => {
        const fake = createFakeIo();
        const transport = createNip46Transport(fake.io, {
            localPubkey: 'c'.repeat(64),
            remoteSignerPubkey: 'd'.repeat(64),
            timeoutMs: 5,
            classifyResponse: async () => undefined,
        });

        await expect(
            transport.sendRequest({
                requestId: 'req-timeout',
                content: 'encrypted-request',
            })
        ).rejects.toThrow('NIP-46 request timed out');

        transport.close();
    });

    test('ignores responses from unexpected author and tags', async () => {
        const fake = createFakeIo();
        const transport = createNip46Transport(fake.io, {
            localPubkey: 'c'.repeat(64),
            remoteSignerPubkey: 'd'.repeat(64),
            timeoutMs: 100,
            classifyResponse: async (event) => {
                const parsed = JSON.parse(event.content) as { id: string };
                return parsed.id;
            },
        });

        const pending = transport.sendRequest({
            requestId: 'req-2',
            content: 'encrypted-request',
        });

        fake.emit({
            kind: 24133,
            pubkey: 'e'.repeat(64),
            tags: [['p', 'c'.repeat(64)]],
            content: JSON.stringify({ id: 'req-2' }),
            created_at: 1,
        });

        fake.emit({
            kind: 24133,
            pubkey: 'd'.repeat(64),
            tags: [['p', 'f'.repeat(64)]],
            content: JSON.stringify({ id: 'req-2' }),
            created_at: 2,
        });

        fake.emit({
            kind: 24133,
            pubkey: 'd'.repeat(64),
            tags: [['p', 'c'.repeat(64)]],
            content: JSON.stringify({ id: 'req-2' }),
            created_at: 3,
        });

        await expect(pending).resolves.toMatchObject({ created_at: 3 });
        transport.close();
    });
});
