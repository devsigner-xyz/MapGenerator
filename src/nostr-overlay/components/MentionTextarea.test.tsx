import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import type { NostrProfile } from '../../nostr/types';
import { createNostrOverlayQueryClient } from '../query/query-client';
import type { SearchUsersResult } from '../query/user-search.query';
import { createMentionDraft, serializeMentionDraft, type MentionDraft } from '../mention-serialization';
import { MentionTextarea } from './MentionTextarea';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                {element}
            </QueryClientProvider>
        );
    });

    return { container, root };
}

async function setTextareaValue(textarea: HTMLTextAreaElement, value: string, selectionStart = value.length): Promise<void> {
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, value);
        textarea.setSelectionRange(selectionStart, selectionStart);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function flushDebounce(): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
    });
}

async function waitForAssertion(assertion: () => void): Promise<void> {
    let lastError: unknown = null;
    for (let index = 0; index < 20; index += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await act(async () => {
                if (vi.isFakeTimers()) {
                    await vi.advanceTimersByTimeAsync(0);
                }
                await Promise.resolve();
            });
        }
    }

    throw lastError;
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

function createSearchResult(entries: Array<{ pubkey: string; displayName: string }>): SearchUsersResult {
    const profiles: Record<string, NostrProfile> = {};
    for (const entry of entries) {
        profiles[entry.pubkey] = {
            pubkey: entry.pubkey,
            displayName: entry.displayName,
        };
    }

    return {
        pubkeys: entries.map((entry) => entry.pubkey),
        profiles,
    };
}

function MentionTextareaHarness({
    onSearch,
    onDraftChange,
    initialDraft = createMentionDraft(''),
}: {
    onSearch: (query: string) => Promise<SearchUsersResult>;
    onDraftChange?: (draft: MentionDraft) => void;
    initialDraft?: MentionDraft;
}) {
    const [draft, setDraft] = useState(initialDraft);

    return (
        <>
            <MentionTextarea
                aria-label="Composer con menciones"
                placeholder="Escribe una nota"
                value={draft}
                onSearch={onSearch}
                onChangeDraft={(nextDraft) => {
                    setDraft(nextDraft);
                    onDraftChange?.(nextDraft);
                }}
            />
            <output data-testid="draft-text">{draft.text}</output>
            <output data-testid="serialized-content">{serializeMentionDraft(draft).content}</output>
            <output data-testid="mentions-count">{String(draft.mentions.length)}</output>
        </>
    );
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (!HTMLElement.prototype.scrollIntoView) {
        HTMLElement.prototype.scrollIntoView = () => {};
    }
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

describe('MentionTextarea', () => {
    test('opens suggestions after typing a mention query and inserts the clicked result', async () => {
        vi.useFakeTimers();
        const alicePubkey = 'a'.repeat(64);
        const onSearch = vi.fn(async () => createSearchResult([{ pubkey: alicePubkey, displayName: 'Alice' }]));

        try {
            const rendered = await renderElement(<MentionTextareaHarness onSearch={onSearch} />);
            mounted.push(rendered);

            const textarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
            await setTextareaValue(textarea, 'hola @al');
            await flushDebounce();

            let aliceButton: HTMLButtonElement | null = null;
            await waitForAssertion(() => {
                aliceButton = document.body.querySelector('button[aria-label="Mencionar a Alice"]') as HTMLButtonElement | null;
                expect(aliceButton).not.toBeNull();
            });

            await act(async () => {
                aliceButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                aliceButton?.click();
            });

            await waitForAssertion(() => {
                const currentTextarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
                expect(currentTextarea.value).toBe('hola @Alice ');
            });
            expect(rendered.container.querySelector('[data-testid="mentions-count"]')?.textContent).toBe('1');
            expect(rendered.container.querySelector('[data-testid="serialized-content"]')?.textContent || '').toContain('nostr:nprofile1');
        } finally {
            vi.useRealTimers();
        }
    });

    test('supports keyboard navigation and enter selection', async () => {
        vi.useFakeTimers();
        const onSearch = vi.fn(async () => createSearchResult([
            { pubkey: 'b'.repeat(64), displayName: 'Alice' },
            { pubkey: 'c'.repeat(64), displayName: 'Bruno' },
        ]));

        try {
            const rendered = await renderElement(<MentionTextareaHarness onSearch={onSearch} />);
            mounted.push(rendered);

            const textarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
            await setTextareaValue(textarea, '@br');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(document.body.textContent || '').toContain('Bruno');
            });

            await act(async () => {
                textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
            });

            await act(async () => {
                textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
            });

            expect(textarea.value).toBe('@Bruno ');
            expect(rendered.container.querySelector('[data-testid="mentions-count"]')?.textContent).toBe('1');
        } finally {
            vi.useRealTimers();
        }
    });

    test('shows suggestions when typing a bare at sign', async () => {
        vi.useFakeTimers();
        const onSearch = vi.fn(async (query: string) => {
            expect(query).toBe('');
            return createSearchResult([{ pubkey: 'd'.repeat(64), displayName: 'Dora' }]);
        });

        try {
            const rendered = await renderElement(<MentionTextareaHarness onSearch={onSearch} />);
            mounted.push(rendered);

            const textarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
            await setTextareaValue(textarea, '@');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(document.body.textContent || '').toContain('Dora');
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test('closes suggestions on escape', async () => {
        vi.useFakeTimers();
        const onSearch = vi.fn(async () => createSearchResult([{ pubkey: 'd'.repeat(64), displayName: 'Dora' }]));

        try {
            const rendered = await renderElement(<MentionTextareaHarness onSearch={onSearch} />);
            mounted.push(rendered);

            const textarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
            await setTextareaValue(textarea, '@do');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(document.body.textContent || '').toContain('Dora');
            });

            await act(async () => {
                textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
            });

            expect(document.body.textContent || '').not.toContain('Dora');
        } finally {
            vi.useRealTimers();
        }
    });

    test('renders loading and empty states while searching mentions', async () => {
        vi.useFakeTimers();
        const deferred = createDeferred<SearchUsersResult>();
        const onSearch = vi.fn(async () => deferred.promise);

        try {
            const rendered = await renderElement(<MentionTextareaHarness onSearch={onSearch} />);
            mounted.push(rendered);

            const textarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
            await setTextareaValue(textarea, '@na');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(document.body.textContent || '').toContain('Buscando usuarios');
            });

            deferred.resolve(createSearchResult([]));

            await waitForAssertion(() => {
                expect(document.body.textContent || '').toContain('Sin resultados');
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test('keeps current suggestions visible and shows a searching indicator during refetch', async () => {
        vi.useFakeTimers();
        const refetchDeferred = createDeferred<SearchUsersResult>();
        const onSearch = vi.fn(async (query: string) => {
            if (query === 'al') {
                return createSearchResult([{ pubkey: 'a'.repeat(64), displayName: 'Alice' }]);
            }

            return refetchDeferred.promise;
        });

        try {
            const rendered = await renderElement(<MentionTextareaHarness onSearch={onSearch} />);
            mounted.push(rendered);

            const textarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
            await setTextareaValue(textarea, '@al');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(document.body.textContent || '').toContain('Alice');
            });

            await setTextareaValue(textarea, '@ali');
            await flushDebounce();

            await waitForAssertion(() => {
                const bodyText = document.body.textContent || '';
                expect(bodyText).toContain('Alice');
                expect(bodyText).toContain('Buscando...');
            });

            refetchDeferred.resolve(createSearchResult([{ pubkey: 'a'.repeat(64), displayName: 'Alice' }]));
        } finally {
            vi.useRealTimers();
        }
    });

    test('invalidates a mention when editing inside its text', async () => {
        vi.useFakeTimers();
        const alicePubkey = 'e'.repeat(64);
        const onSearch = vi.fn(async () => createSearchResult([{ pubkey: alicePubkey, displayName: 'Alice' }]));
        const onDraftChange = vi.fn();

        try {
            const rendered = await renderElement(
                <MentionTextareaHarness
                    onSearch={onSearch}
                    onDraftChange={onDraftChange}
                />
            );
            mounted.push(rendered);

            const textarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
            await setTextareaValue(textarea, '@al');
            await flushDebounce();

            let aliceButton: HTMLButtonElement | null = null;
            await waitForAssertion(() => {
                aliceButton = document.body.querySelector('button[aria-label="Mencionar a Alice"]') as HTMLButtonElement | null;
                expect(aliceButton).not.toBeNull();
            });

            await act(async () => {
                aliceButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                aliceButton?.click();
            });

            await setTextareaValue(textarea, '@Alicia ', 4);

            expect(rendered.container.querySelector('[data-testid="mentions-count"]')?.textContent).toBe('0');
            expect(rendered.container.querySelector('[data-testid="serialized-content"]')?.textContent).toBe('@Alicia ');
            expect(onDraftChange).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    test('renders english suggestion chrome when ui language is en', async () => {
        vi.useFakeTimers();
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const deferred = createDeferred<SearchUsersResult>();
        const onSearch = vi.fn(async () => deferred.promise);

        try {
            const rendered = await renderElement(<MentionTextareaHarness onSearch={onSearch} />);
            mounted.push(rendered);

            const textarea = rendered.container.querySelector('textarea[aria-label="Composer con menciones"]') as HTMLTextAreaElement;
            await setTextareaValue(textarea, '@na');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(document.body.textContent || '').toContain('Searching users');
            });

            deferred.resolve(createSearchResult([{ pubkey: 'a'.repeat(64), displayName: 'Alice' }]));
            await waitForAssertion(() => {
                expect(document.body.textContent || '').toContain('Suggestions');
            });
            expect(document.body.querySelector('button[aria-label="Mention Alice"]')).not.toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });
});
