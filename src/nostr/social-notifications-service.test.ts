import { describe, expect, test } from 'vitest';
import { getZapSenderPubkey, type SocialNotificationEvent } from './social-notifications-service';

function buildEvent(tags: string[][]): SocialNotificationEvent {
    return {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        kind: 9735,
        created_at: 100,
        tags,
        content: '',
    };
}

describe('getZapSenderPubkey', () => {
    test('prefers the sender pubkey from the zap request description when present', () => {
        const sender = 'c'.repeat(64);
        const event = buildEvent([
            ['description', JSON.stringify({ pubkey: sender, tags: [['amount', '21000']] })],
        ]);

        expect(getZapSenderPubkey(event)).toBe(sender);
    });

    test('returns undefined when the description does not expose a valid sender pubkey', () => {
        const event = buildEvent([
            ['description', JSON.stringify({ pubkey: 'invalid-pubkey' })],
        ]);

        expect(getZapSenderPubkey(event)).toBeUndefined();
    });
});
