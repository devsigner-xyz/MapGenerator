import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

describe('settings theme styles', () => {
    test('uses semantic tokens for shared settings sections and copy', () => {
        expect(styles).toMatch(/\.nostr-settings-section\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--card\)\s+96%,\s*transparent\)[^}]*color:\s*var\(--card-foreground\)/s);
        expect(styles).toMatch(/\.nostr-settings-form\s*\{[^}]*gap:\s*1rem;/s);
        expect(styles).toMatch(/\.nostr-shortcuts-content\s+p\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
        expect(styles).toMatch(/\.nostr-ui-slider-value\s*\{[^}]*color:\s*var\(--foreground\)/s);
        expect(styles).toMatch(/\.nostr-ui-slider-marks\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
    });

    test('keeps zap rows on shared semantic surfaces', () => {
        expect(styles).toMatch(/\.nostr-zap-item\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--card\)\s+96%,\s*transparent\)[^}]*color:\s*var\(--card-foreground\)/s);
    });
});
