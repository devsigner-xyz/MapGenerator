import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { NostrProfile } from '../../nostr/types';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SocialSidebar } from './SocialSidebar';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const WAIT_TIMEOUT_MS = 8_000;
const WAIT_INTERVAL_MS = 20;

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    await waitFor(() => container.childNodes.length > 0);

    return { container, root };
}

async function waitFor(condition: () => boolean, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (condition()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    }

    throw new Error(`Condition was not met in ${timeoutMs}ms`);
}

function makePubkey(index: number): string {
    return index.toString(16).padStart(64, '0');
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
    document.body.replaceChildren();
});

describe('SocialSidebar', () => {
    test('opens following and followers as sidebar items with count badges instead of tabs', async () => {
        const alice = makePubkey(1);
        const bob = makePubkey(2);
        const profiles: Record<string, NostrProfile> = {
            [alice]: { pubkey: alice, displayName: 'Alice' },
        };
        const followerProfiles: Record<string, NostrProfile> = {
            [bob]: { pubkey: bob, displayName: 'Bob' },
        };

        const rendered = await renderElement(
            <SidebarProvider>
                <SocialSidebar
                    follows={[alice]}
                    profiles={profiles}
                    followers={[bob]}
                    followerProfiles={followerProfiles}
                    onSelectFollowing={vi.fn()}
                />
            </SidebarProvider>
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="tabs-list"]')).toBeNull();
        expect(rendered.container.textContent || '').toContain('Seguidos');
        expect(rendered.container.textContent || '').toContain('Seguidores');

        const followingButton = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        const followersButton = rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]') as HTMLButtonElement;
        expect(followingButton).toBeDefined();
        expect(followersButton).toBeDefined();
        expect(followingButton.closest('[data-slot="sidebar-menu-item"]')?.textContent || '').toContain('1');
        expect(followersButton.closest('[data-slot="sidebar-menu-item"]')?.textContent || '').toContain('1');

        await act(async () => {
            followingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Alice'));
        expect(document.body.textContent || '').toContain('Seguidos');
        expect(document.body.textContent || '').not.toContain('Bob');

        await act(async () => {
            const closeButton = document.body.querySelector('[data-slot="dialog-close"] button, button.absolute.top-2.right-2') as HTMLButtonElement;
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            followersButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Bob'));
        expect(document.body.textContent || '').toContain('Seguidores');
    });
});
