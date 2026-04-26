import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { EasterEggDialog } from './EasterEggDialog';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted.length = 0;
});

async function renderDialog(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    const result = { container, root };
    mounted.push(result);
    return result;
}

describe('EasterEggDialog', () => {
    test('defines a max-width at least as wide as occupant profile dialogs', () => {
        const styles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

        expect(styles).toMatch(/\.nostr-easter-egg-dialog\s*\{[^}]*max-width:\s*min\(1040px,\s*calc\(100vw - 32px\)\)/s);
    });

    test('renders pdf controls and iframe for bitcoin whitepaper', async () => {
        const rendered = await renderDialog(
            <EasterEggDialog
                buildingIndex={1}
                onClose={vi.fn()}
                entry={{
                    id: 'bitcoin_whitepaper',
                    kind: 'pdf',
                    title: 'Bitcoin: A Peer-to-Peer Electronic Cash System',
                    sourceUrl: 'https://bitcoin.org/bitcoin.pdf',
                    pdfPath: '/easter-eggs/bitcoin.pdf',
                    downloadFileName: 'bitcoin.pdf',
                }}
            />
        );

        const iframe = rendered.container.querySelector('iframe.nostr-easter-egg-pdf') as HTMLIFrameElement;
        expect(iframe).toBeDefined();
        expect(iframe.getAttribute('src')).toBe('/easter-eggs/bitcoin.pdf');
        expect(rendered.container.textContent || '').toContain('Descargar PDF');
        expect(rendered.container.textContent || '').toContain('Abrir / Ampliar');
    });

    test('renders plain text for non-pdf entries', async () => {
        const rendered = await renderDialog(
            <EasterEggDialog
                buildingIndex={0}
                onClose={vi.fn()}
                entry={{
                    id: 'crypto_anarchist_manifesto',
                    kind: 'text',
                    title: 'The Crypto Anarchist Manifesto',
                    sourceUrl: 'https://nakamotoinstitute.org/library/crypto-anarchist-manifesto/',
                    text: 'Arise, you have nothing to lose but your barbed wire fences.',
                }}
            />
        );

        const textBlock = rendered.container.querySelector('pre.nostr-easter-egg-text') as HTMLPreElement;
        expect(textBlock).toBeDefined();
        expect(textBlock.textContent || '').toContain('barbed wire fences');
    });

    test('renders english chrome and actions when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderDialog(
            <EasterEggDialog
                buildingIndex={0}
                onClose={vi.fn()}
                entry={{
                    id: 'bitcoin_whitepaper',
                    kind: 'pdf',
                    title: 'Bitcoin: A Peer-to-Peer Electronic Cash System',
                    sourceUrl: 'https://bitcoin.org/bitcoin.pdf',
                    pdfPath: '/easter-eggs/bitcoin.pdf',
                    downloadFileName: 'bitcoin.pdf',
                }}
            />
        );

        const text = rendered.container.textContent || '';
        expect(text).toContain('Building #1');
        expect(text).toContain('Download PDF');
        expect(text).toContain('Open / Expand');
        expect(text).toContain('Source');
        const closeButton = rendered.container.querySelector('button.absolute.top-2.right-2') as HTMLButtonElement | null;
        expect(closeButton).not.toBeNull();
        expect(closeButton?.className).not.toContain('nostr-dialog-close');
    });
});
