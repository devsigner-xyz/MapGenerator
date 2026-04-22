import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { createNostrOverlayQueryClient } from '../query/query-client';
import { SocialComposeDialog } from './SocialComposeDialog';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <SocialComposeDialog
                    open
                    mode="post"
                    profilesByPubkey={{}}
                    onSearchUsers={vi.fn(async () => ({ pubkeys: [], profiles: {} }))}
                    onOpenChange={vi.fn()}
                    onSubmit={vi.fn(async () => {})}
                />
            </QueryClientProvider>
        );
    });

    return { container, root } satisfies RenderResult;
}

let mounted: RenderResult[] = [];

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
    mounted = [];
});

describe('SocialComposeDialog', () => {
    test('renders english dialog copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Publish');
        expect(text).toContain('Write a new post for Agora.');
        expect(text).toContain('Cancel');
        const textarea = rendered.container.querySelector('textarea[aria-label="Compose post"]') as HTMLTextAreaElement | null;
        expect(textarea?.getAttribute('placeholder')).toBe('What are you thinking?');
    });
});
