import { describe, expect, test } from 'vitest';
import { normalizeEngagementEventIds } from './following-feed.query';

describe('following feed engagement query helpers', () => {
    test('filters temporary optimistic ids before requesting engagement', () => {
        expect(normalizeEngagementEventIds([
            'temp-post:123',
            'f'.repeat(64),
            'temp-reply:456',
            'f'.repeat(64),
            'not-hex',
            'a'.repeat(64),
        ])).toEqual([
            'f'.repeat(64),
            'a'.repeat(64),
        ]);
    });
});
