import { describe, expect, test, vi } from 'vitest';
import { getDefaultRelaySettings } from '../relay-settings';
import { bootstrapLocalAccount } from './bootstrap-profile';

describe('bootstrapLocalAccount', () => {
    test('signs profile, relay list, and dm inbox bootstrap events', async () => {
        const publishEvent = vi.fn(async (event) => ({
            ...event,
            id: `${event.kind}`.repeat(64).slice(0, 64),
            pubkey: 'f'.repeat(64),
        }));

        const relaySettings = getDefaultRelaySettings();
        await bootstrapLocalAccount({
            writeGateway: { publishEvent },
            profile: {
                name: 'Pablo',
                about: 'Mapa y nostr',
                picture: 'https://example.com/avatar.png',
            },
            relaySettings,
            now: () => 123,
        });

        expect(publishEvent).toHaveBeenNthCalledWith(1, {
            kind: 0,
            content: JSON.stringify({
                name: 'Pablo',
                about: 'Mapa y nostr',
                picture: 'https://example.com/avatar.png',
            }),
            created_at: 123,
            tags: [],
        });

        expect(publishEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 10002, created_at: 123 }));
        expect(publishEvent.mock.calls[1]?.[0]?.tags).toContainEqual(['r', 'wss://relay.damus.io']);

        expect(publishEvent).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 10050, created_at: 123 }));
        expect(publishEvent.mock.calls[2]?.[0]?.tags).toContainEqual(['relay', 'wss://relay.snort.social']);
    });

    test('skips profile event when profile fields are empty', async () => {
        const publishEvent = vi.fn(async (event) => ({
            ...event,
            id: `${event.kind}`.repeat(64).slice(0, 64),
            pubkey: 'f'.repeat(64),
        }));

        await bootstrapLocalAccount({
            writeGateway: { publishEvent },
            relaySettings: getDefaultRelaySettings(),
            now: () => 999,
        });

        expect(publishEvent).toHaveBeenCalledTimes(2);
        expect(publishEvent.mock.calls[0]?.[0]?.kind).toBe(10002);
        expect(publishEvent.mock.calls[1]?.[0]?.kind).toBe(10050);
    });

    test('continues attempting relay bootstrap events after an earlier publish failure', async () => {
        const publishEvent = vi.fn()
            .mockRejectedValueOnce(new Error('profile failed'))
            .mockResolvedValueOnce({ id: 'relay-list' })
            .mockResolvedValueOnce({ id: 'dm-list' });

        await expect(bootstrapLocalAccount({
            writeGateway: { publishEvent },
            profile: { name: 'Pablo' },
            relaySettings: getDefaultRelaySettings(),
            now: () => 123,
        })).rejects.toThrow('profile failed');

        expect(publishEvent).toHaveBeenCalledTimes(3);
        expect(publishEvent.mock.calls[1]?.[0]?.kind).toBe(10002);
        expect(publishEvent.mock.calls[2]?.[0]?.kind).toBe(10050);
    });
});
