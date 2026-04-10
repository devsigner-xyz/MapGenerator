import { describe, expect, test } from 'vitest';
import { EASTER_EGG_CATALOG, EASTER_EGG_IDS, getEasterEggEntry } from './catalog';


describe('easter egg catalog', () => {
    test('defines the expected easter egg ids', () => {
        expect(EASTER_EGG_IDS).toEqual([
            'bitcoin_whitepaper',
            'crypto_anarchist_manifesto',
            'cyberspace_independence',
        ]);
    });

    test('resolves every id to a catalog entry', () => {
        for (const id of EASTER_EGG_IDS) {
            expect(getEasterEggEntry(id)).toBe(EASTER_EGG_CATALOG[id]);
        }
    });

    test('contains pdf metadata for bitcoin whitepaper', () => {
        const entry = EASTER_EGG_CATALOG.bitcoin_whitepaper;
        expect(entry.kind).toBe('pdf');
        if (entry.kind !== 'pdf') {
            return;
        }

        expect(entry.pdfPath).toBe('/easter-eggs/bitcoin.pdf');
        expect(entry.downloadFileName).toBe('bitcoin.pdf');
    });

    test('contains non-empty text for manifesto and declaration', () => {
        const manifesto = EASTER_EGG_CATALOG.crypto_anarchist_manifesto;
        const declaration = EASTER_EGG_CATALOG.cyberspace_independence;

        expect(manifesto.kind).toBe('text');
        expect(declaration.kind).toBe('text');

        if (manifesto.kind !== 'text' || declaration.kind !== 'text') {
            return;
        }

        expect(manifesto.text.trim().length).toBeGreaterThan(100);
        expect(declaration.text.trim().length).toBeGreaterThan(100);
    });
});
