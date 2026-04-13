import { describe, expect, test } from 'vitest';
import { buildRelayDetailPath, parseRelayDetailSearch } from './relay-detail-routing';

describe('relay-detail-routing', () => {
    test('builds path with encoded query params', () => {
        const path = buildRelayDetailPath({
            relayUrl: 'wss://relay.example/path',
            source: 'configured',
            relayType: 'nip65Both',
        });

        expect(path).toContain('/settings/relays/detail?');
        expect(path).toContain('url=wss%3A%2F%2Frelay.example%2Fpath');
        expect(path).toContain('source=configured');
        expect(path).toContain('type=nip65Both');
    });

    test('parses valid relay detail search params', () => {
        const parsed = parseRelayDetailSearch('?url=wss%3A%2F%2Frelay.one&source=suggested&type=dmInbox');
        expect(parsed).toEqual({
            relayUrl: 'wss://relay.one',
            source: 'suggested',
            relayType: 'dmInbox',
        });
    });

    test('returns null for missing or invalid params', () => {
        expect(parseRelayDetailSearch('')).toBeNull();
        expect(parseRelayDetailSearch('?url=wss%3A%2F%2Frelay.one&source=bad&type=nip65Both')).toBeNull();
        expect(parseRelayDetailSearch('?url=wss%3A%2F%2Frelay.one&source=configured&type=bad')).toBeNull();
        expect(parseRelayDetailSearch('?source=configured&type=nip65Both')).toBeNull();
    });
});
