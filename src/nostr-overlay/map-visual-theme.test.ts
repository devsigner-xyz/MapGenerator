import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

describe('map visual dark theme styles', () => {
    test('keeps map zoom actions in one row', () => {
        expect(styles).toMatch(/\.nostr-map-zoom-controls\s*\{[^}]*flex-direction:\s*row;/s);
        expect(styles).toMatch(/\.nostr-map-zoom-controls\s*\{[^}]*align-items:\s*center;/s);
    });

    test('defines dark styles for map zoom controls', () => {
        expect(styles).toMatch(/\.dark\s+\.nostr-map-zoom-group\s*\{[^}]*background:\s*rgba\(1,\s*4,\s*50,/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-regenerate-button\s*\{[^}]*background:\s*rgba\(1,\s*4,\s*50,/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-zoom-level\s*\{[^}]*color:\s*#A2F0FE/s);
    });

    test('uses surface-only map control wrappers without borders', () => {
        expect(styles).toMatch(/\.nostr-map-zoom-group\s*\{[^}]*border:\s*0;/s);
        expect(styles).toMatch(/\.nostr-map-display-toggle-group\s*\{[^}]*border:\s*0;/s);
        expect(styles).toMatch(/\.nostr-map-theme-toggle-group\s*\{[^}]*border:\s*0;/s);
        expect(styles).toMatch(/\.nostr-map-regenerate-button\s*\{[^}]*border:\s*0;/s);
    });

    test('aligns display toggles with map action control surfaces', () => {
        expect(styles).toMatch(/\.nostr-map-display-toggle-group\s*\{[^}]*min-height:\s*38px;/s);
        expect(styles).toMatch(/\.nostr-map-regenerate-button\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-display-toggle-group\s*\{[^}]*background:\s*rgba\(1,\s*4,\s*50,/s);
    });

    test('separates zoom controls and keeps zoom buttons circular', () => {
        expect(styles).toMatch(/\.nostr-map-zoom-group\s*\{[^}]*gap:\s*0\.25rem;/s);
        expect(styles).toMatch(/\.nostr-map-zoom-button\s*\{[^}]*border-radius:\s*999px;/s);
        expect(styles).toMatch(/\.nostr-map-zoom-level\s*\{[^}]*border:\s*0;/s);
    });

    test('distinguishes active display toggles from inactive toggles', () => {
        expect(styles).toMatch(/\.nostr-map-display-toggle-button\[data-state="on"\]\s*\{[^}]*border:\s*0;/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-display-toggle-button\[data-state="on"\]\s*\{[^}]*background:\s*rgba\(162,\s*240,\s*254,/s);
    });

    test('defines dark styles for map occupant and owner badges', () => {
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-tag\s*\{[^}]*background:\s*rgba\(1,\s*21,\s*86,/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-name\s*\{[^}]*color:\s*#FCFDFE/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-owner-name\s*\{[^}]*color:\s*#FCFDFE/s);
    });
});
