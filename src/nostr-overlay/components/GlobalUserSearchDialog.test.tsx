import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { NostrProfile } from '../../nostr/types';
import { GlobalUserSearchDialog } from './GlobalUserSearchDialog';

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

describe('GlobalUserSearchDialog', () => {
    test('debounces search calls by 300ms', async () => {
        vi.useFakeTimers();
        const onSearch = vi.fn(async () => ({ pubkeys: [], profiles: {} }));

        try {
            const rendered = await renderElement(
                <GlobalUserSearchDialog
                    open
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;
            expect(input).toBeDefined();

            await act(async () => {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                setter?.call(input, 'alice');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });

            expect(onSearch).not.toHaveBeenCalled();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(299);
            });

            expect(onSearch).not.toHaveBeenCalled();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(1);
            });

            expect(onSearch).toHaveBeenCalledTimes(1);
            expect(onSearch).toHaveBeenCalledWith('alice');
        } finally {
            vi.useRealTimers();
        }
    });

    test('renders search result rows', async () => {
        vi.useFakeTimers();
        const pubkey = 'a'.repeat(64);
        const profiles: Record<string, NostrProfile> = {
            [pubkey]: {
                pubkey,
                displayName: 'Alice',
            },
        };
        const onSearch = vi.fn(async () => ({
            pubkeys: [pubkey],
            profiles,
        }));

        try {
            const rendered = await renderElement(
                <GlobalUserSearchDialog
                    open
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;

            await act(async () => {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                setter?.call(input, 'alice');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await vi.advanceTimersByTimeAsync(300);
                await Promise.resolve();
            });

            expect(rendered.container.textContent || '').toContain('Alice');
            expect(rendered.container.textContent || '').toContain('Ver detalles');
        } finally {
            vi.useRealTimers();
        }
    });

    test('calls onSelectUser when user row action is clicked', async () => {
        vi.useFakeTimers();
        const pubkey = 'b'.repeat(64);
        const onSelectUser = vi.fn();
        const onSearch = vi.fn(async () => ({
            pubkeys: [pubkey],
            profiles: {
                [pubkey]: { pubkey, name: 'Bob' },
            },
        }));

        try {
            const rendered = await renderElement(
                <GlobalUserSearchDialog
                    open
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={onSelectUser}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;

            await act(async () => {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                setter?.call(input, 'bob');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await vi.advanceTimersByTimeAsync(300);
                await Promise.resolve();
            });

            const detailsButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
                (button.textContent || '').trim() === 'Ver detalles'
            ) as HTMLButtonElement;
            expect(detailsButton).toBeDefined();

            await act(async () => {
                detailsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            expect(onSelectUser).toHaveBeenCalledTimes(1);
            expect(onSelectUser).toHaveBeenCalledWith(pubkey);
        } finally {
            vi.useRealTimers();
        }
    });

    test('shows spinner while searching and supports clear action', async () => {
        vi.useFakeTimers();
        let resolveSearch: ((value: { pubkeys: string[]; profiles: Record<string, NostrProfile> }) => void) | null = null;
        const onSearch = vi.fn(
            async () =>
                new Promise<{ pubkeys: string[]; profiles: Record<string, NostrProfile> }>((resolve) => {
                    resolveSearch = resolve;
                })
        );

        try {
            const rendered = await renderElement(
                <GlobalUserSearchDialog
                    open
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;
            const clearButton = rendered.container.querySelector('button[aria-label="Limpiar busqueda global"]') as HTMLButtonElement;
            expect(clearButton.disabled).toBe(true);

            await act(async () => {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                setter?.call(input, 'alice');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await vi.advanceTimersByTimeAsync(300);
                await Promise.resolve();
            });

            expect(clearButton.disabled).toBe(false);
            expect(rendered.container.querySelector('[aria-label="Buscando usuarios"]')).not.toBeNull();

            await act(async () => {
                clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            const inputAfterClear = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;
            expect(inputAfterClear.value).toBe('');

            await act(async () => {
                resolveSearch?.({ pubkeys: [], profiles: {} });
                await Promise.resolve();
            });
        } finally {
            vi.useRealTimers();
        }
    });
});
