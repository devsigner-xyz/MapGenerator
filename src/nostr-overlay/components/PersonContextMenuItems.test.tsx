import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { PersonContextMenuItems } from './PersonContextMenuItems';

vi.mock('@/components/ui/context-menu', () => ({
    ContextMenuItem: ({ children, ...props }: ComponentProps<'button'>) => <button type="button" {...props}>{children}</button>,
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <div>
                <PersonContextMenuItems
                    onCopyNpub={vi.fn()}
                    onSendMessage={vi.fn()}
                    onViewDetails={vi.fn()}
                    onLocateOnMap={vi.fn()}
                />
            </div>
        );
    });

    return { container, root } satisfies RenderResult;
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('PersonContextMenuItems', () => {
    test('renders english labels when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Locate on map');
        expect(text).toContain('Copy npub');
        expect(text).toContain('Send message');
        expect(text).toContain('View details');
    });
});
