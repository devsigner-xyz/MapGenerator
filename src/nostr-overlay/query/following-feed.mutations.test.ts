import { describe, expect, test } from 'vitest';
import { buildQuoteContent, buildQuoteTags } from './following-feed.mutations';

describe('following feed mutations', () => {
    test('builds quote content with user text and nostr nevent reference', () => {
        const targetEventId = '9'.repeat(64);
        const targetPubkey = '8'.repeat(64);

        const content = buildQuoteContent({
            content: 'mira esto',
            targetEventId,
            targetPubkey,
        });

        expect(content).toContain('mira esto');
        expect(content).toContain('nostr:nevent1');
    });

    test('builds quote tags with event and author references', () => {
        expect(buildQuoteTags({
            targetEventId: '9'.repeat(64),
            targetPubkey: '8'.repeat(64),
        })).toEqual([
            ['q', '9'.repeat(64)],
            ['p', '8'.repeat(64)],
        ]);
    });
});
