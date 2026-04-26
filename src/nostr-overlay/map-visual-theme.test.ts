import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

describe('map visual dark theme styles', () => {
    test('defines dark styles for map zoom controls', () => {
        expect(styles).toMatch(/\.dark\s+\.nostr-map-zoom-group\s*\{[^}]*background:\s*rgba\(1,\s*4,\s*50,/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-regenerate-button\s*\{[^}]*background:\s*rgba\(1,\s*4,\s*50,/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-zoom-level\s*\{[^}]*color:\s*#A2F0FE/s);
    });

    test('defines dark styles for map occupant and owner badges', () => {
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-tag\s*\{[^}]*background:\s*rgba\(1,\s*21,\s*86,/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-name\s*\{[^}]*color:\s*#FCFDFE/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-owner-name\s*\{[^}]*color:\s*#FCFDFE/s);
    });
});
