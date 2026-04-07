import { describe, expect, test } from 'vitest';
import { shouldRegenerateMapOnViewportInsetChange } from './viewport_inset';

describe('viewport inset regeneration policy', () => {
    test('does not regenerate map when sidebar visibility changes', () => {
        expect(shouldRegenerateMapOnViewportInsetChange({
            tensorFieldVisible: false,
            roadsEmpty: false,
        })).toBe(false);
    });
});
