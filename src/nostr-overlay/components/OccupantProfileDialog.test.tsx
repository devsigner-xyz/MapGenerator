import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { OccupantProfileDialog } from './OccupantProfileDialog';

const { toastSuccessMock } = vi.hoisted(() => ({
    toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: toastSuccessMock,
    },
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

async function waitForCondition(check: () => boolean, timeoutMs: number = 2000): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (check()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
    }

    throw new Error('Condition was not met in time');
}

async function selectTab(label: string): Promise<void> {
    const tab = Array.from(document.body.querySelectorAll('[data-slot="tabs-trigger"]')).find((node) =>
        (node.textContent || '').trim() === label
        || (node.textContent || '').trim().startsWith(`${label} (`)
    ) as HTMLElement;
    expect(tab).toBeDefined();

    await act(async () => {
        tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function buildProps(overrides: Partial<Parameters<typeof OccupantProfileDialog>[0]> = {}): Parameters<typeof OccupantProfileDialog>[0] {
    return {
        pubkey: 'a'.repeat(64),
        profile: {
            pubkey: 'a'.repeat(64),
            displayName: 'Alice',
        },
        followsCount: 2,
        followersCount: 1,
        statsLoading: false,
        posts: [],
        postsLoading: false,
        hasMorePosts: false,
        follows: ['b'.repeat(64), 'c'.repeat(64)],
        followers: ['d'.repeat(64)],
        networkProfiles: {
            ['b'.repeat(64)]: { pubkey: 'b'.repeat(64), displayName: 'Bob' },
            ['c'.repeat(64)]: { pubkey: 'c'.repeat(64), displayName: 'Carol' },
            ['d'.repeat(64)]: { pubkey: 'd'.repeat(64), displayName: 'Dave' },
        },
        networkLoading: false,
        onLoadMorePosts: vi.fn(async () => {}),
        onClose: vi.fn(),
        ...overrides,
    };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('OccupantProfileDialog', () => {
    test('shows four tabs and removes legacy social stats block', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const bannerShell = document.body.querySelector('.nostr-profile-dialog-banner-shell') as HTMLElement;
        expect(bannerShell).toBeDefined();
        expect(bannerShell.classList.contains('is-placeholder')).toBe(true);

        const tabLabels = Array.from(document.body.querySelectorAll('[data-slot="tabs-trigger"]'))
            .map((node) => (node.textContent || '').trim());

        expect(tabLabels).toContain('Información');
        expect(tabLabels).toContain('Feed');
        expect(tabLabels).toContain('Seguidores (1)');
        expect(tabLabels).toContain('Siguiendo (2)');

        expect(document.body.textContent || '').not.toContain('Cargando estadisticas...');

        const metricLabels = Array.from(document.body.querySelectorAll('dt')).map((node) => (node.textContent || '').trim());
        expect(metricLabels).not.toContain('Siguiendo');
        expect(metricLabels).not.toContain('Seguidores');

        const subheadings = Array.from(document.body.querySelectorAll('h5')).map((node) => (node.textContent || '').trim());
        expect(subheadings).not.toContain('Sigue a');
        expect(subheadings).not.toContain('Le siguen');
    });

    test('shows copy npub action next to npub and writes full npub to clipboard', async () => {
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const copyButton = document.body.querySelector('button[aria-label="Copiar npub"]') as HTMLButtonElement;
        expect(copyButton).toBeDefined();

        await act(async () => {
            copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0][0] as string).startsWith('npub1')).toBe(true);
        expect(toastSuccessMock).toHaveBeenCalledWith('npub copiada', { duration: 1600 });
    });

    test('renders enriched about tab without avatar url row and opens avatar lightbox on click', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    profile: {
                        pubkey: 'a'.repeat(64),
                        displayName: 'Alice',
                        picture: 'https://example.com/avatar.png',
                        banner: 'https://example.com/banner.png',
                        nip05: 'alice@example.com',
                        about: 'Construyendo sobre Nostr.',
                        website: 'https://alice.dev',
                        lud16: 'alice@getalby.com',
                        lud06: 'lnurl1dp68gurn8ghj7mmsw3skccnwv4uxzmtsd3jjucm0d5hkgct5v9cx7mmsxqex2atwv9ujuetcv9khqmr9xqcnqve5xqersv3nxg6ryv3h',
                        bot: true,
                        externalIdentities: ['github:alice', 'mastodon:nostr.example/@alice'],
                    },
                    verification: {
                        status: 'verified',
                        identifier: 'alice@example.com',
                        displayIdentifier: 'alice@example.com',
                        checkedAt: Date.now(),
                    },
                })}
            />
        );
        mounted.push(rendered);

        const banner = document.body.querySelector('.nostr-profile-dialog-banner') as HTMLImageElement;
        const header = document.body.querySelector('.nostr-dialog-header') as HTMLElement;
        expect(banner).toBeDefined();
        expect(header).toBeDefined();
        expect((banner.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);

        await selectTab('Información');
        await waitForCondition(() => (document.body.textContent || '').includes('Construyendo sobre Nostr.'));

        const text = document.body.textContent || '';
        expect(text).toContain('NIP-05');
        expect(text).toContain('Descripcion');
        expect(text).toContain('Sitio web');
        expect(text).toContain('LUD16');
        expect(text).toContain('LUD06');
        expect(text).toContain('Bot');
        expect(text).toContain('Identidades externas');
        expect(text).not.toContain('Avatar');
        expect(text).not.toContain('https://example.com/avatar.png');

        const avatarTrigger = document.body.querySelector('.nostr-dialog-avatar-trigger') as HTMLButtonElement;
        expect(avatarTrigger).toBeDefined();

        await act(async () => {
            avatarTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const lightboxRoot = document.body.querySelector('.yarl__root');
        expect(lightboxRoot).toBeDefined();
    });

    test('uses shadcn empty loading state with spinner in feed tab', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    postsLoading: true,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');

        await waitForCondition(() => (document.body.textContent || '').includes('Cargando publicaciones'));
        expect(document.body.textContent || '').not.toContain('Notas');

        const feedEmpty = document.body.querySelector('.nostr-profile-posts-empty[data-slot="empty"]') as HTMLElement | null;
        expect(feedEmpty).not.toBeNull();
        expect(feedEmpty.querySelector('[aria-label="Loading"]')).not.toBeNull();
        expect(feedEmpty.textContent || '').toContain('Cargando publicaciones');

        const centeredLoading = document.body.querySelector('.nostr-profile-posts-empty-state') as HTMLElement | null;
        expect(centeredLoading).not.toBeNull();
        expect(centeredLoading?.contains(feedEmpty)).toBe(true);
    });

    test('uses centered shadcn empty state without spinner when feed has no posts', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    posts: [],
                    postsLoading: false,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => (document.body.textContent || '').includes('No hay publicaciones recientes disponibles.'));

        const centeredEmpty = document.body.querySelector('.nostr-profile-posts-empty-state') as HTMLElement;
        expect(centeredEmpty).toBeDefined();

        const feedEmpty = document.body.querySelector('.nostr-profile-posts-empty[data-slot="empty"]') as HTMLElement;
        expect(feedEmpty).toBeDefined();
        expect(feedEmpty.querySelector('[aria-label="Loading"]')).toBeNull();
    });

    test('uses shadcn empty loading state with spinner in followers/following tabs', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    follows: [],
                    followers: [],
                    networkLoading: true,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Seguidores');
        await waitForCondition(() => (document.body.textContent || '').includes('Cargando seguidores'));

        const followersEmpty = document.body.querySelector('[data-slot="empty"]') as HTMLElement;
        expect(followersEmpty).toBeDefined();
        expect(followersEmpty.querySelector('[aria-label="Loading"]')).not.toBeNull();

        await selectTab('Siguiendo');
        await waitForCondition(() => (document.body.textContent || '').includes('Cargando seguidos'));

        const followingEmpty = document.body.querySelector('[data-slot="empty"]') as HTMLElement;
        expect(followingEmpty).toBeDefined();
        expect(followingEmpty.querySelector('[aria-label="Loading"]')).not.toBeNull();
    });

    test('uses centered shadcn empty state without spinner in followers/following tabs', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    follows: [],
                    followers: [],
                    networkLoading: false,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Seguidores');
        await waitForCondition(() => (document.body.textContent || '').includes('Sin seguidores visibles.'));

        const followersCenteredEmpty = document.body.querySelector('.nostr-profile-network-empty-state') as HTMLElement;
        expect(followersCenteredEmpty).toBeDefined();

        const followersEmpty = document.body.querySelector('.nostr-profile-network-empty[data-slot="empty"]') as HTMLElement;
        expect(followersEmpty).toBeDefined();
        expect(followersEmpty.querySelector('[aria-label="Loading"]')).toBeNull();

        await selectTab('Siguiendo');
        await waitForCondition(() => (document.body.textContent || '').includes('Sin seguidos visibles.'));

        const followingCenteredEmpty = document.body.querySelector('.nostr-profile-network-empty-state') as HTMLElement;
        expect(followingCenteredEmpty).toBeDefined();

        const followingEmpty = document.body.querySelector('.nostr-profile-network-empty[data-slot="empty"]') as HTMLElement;
        expect(followingEmpty).toBeDefined();
        expect(followingEmpty.querySelector('[aria-label="Loading"]')).toBeNull();
    });

    test('shows followers and following lists under their own tabs', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        await selectTab('Seguidores');

        await waitForCondition(() => (document.body.textContent || '').includes('Dave'));

        await selectTab('Siguiendo');

        await waitForCondition(() => {
            const text = document.body.textContent || '';
            return text.includes('Bob') && text.includes('Carol');
        });
    });

    test('keeps header and tabs fixed while only tab panels are scrollable', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const dialogBody = document.body.querySelector('.nostr-profile-dialog-body') as HTMLElement;
        expect(dialogBody).toBeDefined();

        const tabsList = document.body.querySelector('[data-slot="tabs-list"]') as HTMLElement;
        expect(tabsList).toBeDefined();

        const assertCurrentPanelScrollable = () => {
            const scrollPanel = document.body.querySelector('.nostr-profile-tab-panel-scroll') as HTMLElement;
            expect(scrollPanel).toBeDefined();
            expect(scrollPanel.style.scrollbarGutter).toBe('stable');
            expect(scrollPanel.style.height).toBe('100%');
        };

        assertCurrentPanelScrollable();
        await selectTab('Feed');
        assertCurrentPanelScrollable();
        await selectTab('Seguidores');
        assertCurrentPanelScrollable();
        await selectTab('Siguiendo');
        assertCurrentPanelScrollable();
    });

    test('renders inline media previews for image and video URLs in feed posts', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    posts: [
                        {
                            id: 'post-media-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: 'Imagen https://example.com/photo.jpg y video https://example.com/clip.mp4',
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => document.body.querySelector('.nostr-profile-post-item') !== null);

        const image = document.body.querySelector('img[src="https://example.com/photo.jpg"]');
        const video = document.body.querySelector('video[src="https://example.com/clip.mp4"]');
        const link = document.body.querySelector('a[href="https://example.com/photo.jpg"]');

        expect(image).toBeDefined();
        expect(video).toBeDefined();
        expect(link).toBeNull();
    });

    test('clicking a post hashtag emits callback to open agora hashtag feed', async () => {
        const onSelectHashtag = vi.fn();
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    onSelectHashtag,
                    posts: [
                        {
                            id: 'post-hashtag-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: 'Vamos #NostrCity',
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => document.body.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') !== null);

        const hashtagButton = document.body.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') as HTMLButtonElement;
        expect(hashtagButton).toBeDefined();

        await act(async () => {
            hashtagButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectHashtag).toHaveBeenCalledWith('nostrcity');
    });

    test('moves full verification indicator to information tab and shows icon badge near name', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    profile: {
                        pubkey: 'a'.repeat(64),
                        displayName: 'Alice',
                        nip05: 'alice@example.com',
                    },
                    verification: {
                        status: 'verified',
                        identifier: 'alice@example.com',
                        displayIdentifier: 'alice@example.com',
                        checkedAt: Date.now(),
                    },
                })}
            />
        );
        mounted.push(rendered);

        const nameRow = document.body.querySelector('.nostr-dialog-name') as HTMLElement;
        expect(nameRow).toBeDefined();
        expect(nameRow.textContent || '').not.toContain('alice@example.com');

        const verifiedBadge = nameRow.querySelector('.nostr-verified-badge') as HTMLElement;
        expect(verifiedBadge).toBeDefined();
        expect(verifiedBadge.textContent || '').toBe('');

        const infoChip = document.body.querySelector('.nostr-profile-info-list .nostr-nip05-chip') as HTMLElement;
        expect(infoChip).toBeDefined();
        expect(infoChip.textContent || '').toContain('alice@example.com');
    });
});
