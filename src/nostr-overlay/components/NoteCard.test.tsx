import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { NoteCardModel } from './note-card-model';
import { NoteCard } from './NoteCard';

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
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

const defaultNoteFixture: NoteCardModel = {
    id: 'note-1',
    pubkey: 'a'.repeat(64),
    createdAt: 100,
    content: 'hola',
    tags: [],
    variant: 'default',
    showCopyId: true,
    nestingLevel: 0,
    actions: {
        canWrite: true,
        isReactionActive: false,
        isRepostActive: false,
        isReactionPending: false,
        isRepostPending: false,
        replies: 1,
        reactions: 3,
        reposts: 2,
        zapSats: 210,
        onReply: () => {},
        onViewDetail: () => {},
        onToggleReaction: async () => true,
        onToggleRepost: async () => true,
    },
};

const deepNestedFixture: NoteCardModel = {
    id: 'abcde123000000000000000000000000000000000000000000000000fff999',
    pubkey: 'b'.repeat(64),
    createdAt: 99,
    content: 'x'.repeat(150),
    tags: [],
    variant: 'nested',
    showCopyId: true,
    nestingLevel: 2,
};

async function renderNoteCard(note: NoteCardModel = defaultNoteFixture) {
    const onCopyNoteId = vi.fn();
    const rendered = await renderElement(
        <NoteCard
            note={note}
            profilesByPubkey={{}}
            onCopyNoteId={onCopyNoteId}
            onSelectEventReference={() => {}}
        />,
    );
    mounted.push(rendered);
    return { container: rendered.container, onCopyNoteId };
}

function createNestedNote(input: Partial<NoteCardModel> & { id: string }): NoteCardModel {
    const note: NoteCardModel = {
        id: input.id,
        pubkey: input.pubkey ?? 'c'.repeat(64),
        createdAt: input.createdAt ?? 200,
        content: input.content ?? `contenido ${input.id}`,
        tags: input.tags ?? [],
        variant: input.variant ?? 'nested',
        showCopyId: input.showCopyId ?? true,
        nestingLevel: input.nestingLevel ?? 1,
    };

    if (input.kindLabel !== undefined) {
        note.kindLabel = input.kindLabel;
    }
    if (input.actions !== undefined) {
        note.actions = input.actions;
    }
    if (input.embedded !== undefined) {
        note.embedded = input.embedded;
    }
    if (input.referencedNotes !== undefined) {
        note.referencedNotes = input.referencedNotes;
    }

    return note;
}

describe('NoteCard', () => {
    async function renderDefault() {
        return await renderNoteCard(defaultNoteFixture);
    }

    async function renderDeep() {
        return await renderNoteCard(deepNestedFixture);
    }

    test('renders author header via item and actions via button group', async () => {
        const { container } = await renderDefault();

        expect(container.querySelector('article')).not.toBeNull();
        expect(container.querySelector('time[datetime]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Responder (1)"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Reaccionar (3)"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Repostear (2)"]')).not.toBeNull();
        expect(container.querySelector('[aria-label="Sats recibidos: 210"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Abrir acciones para la nota note-1"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Copiar identificador de nota note-1"]')).toBeNull();
    });

    test('opens note detail on card click when view detail is available', async () => {
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onViewDetail,
            },
        });

        const article = container.querySelector('article') as HTMLElement;
        await act(async () => {
            article.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onViewDetail).toHaveBeenCalledTimes(1);
    });

    test('opens note detail on card click when provided by actions', async () => {
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onViewDetail,
            },
        });

        const article = container.querySelector('article') as HTMLElement;
        await act(async () => {
            article.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onViewDetail).toHaveBeenCalledTimes(1);
    });

    test('nested depth >= 2 renders compact fallback with open reference button', async () => {
        const { container } = await renderDeep();

        expect(container.textContent || '').toContain('Nota referenciada');
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Abrir nota referenciada abcde123000000000000000000000000000000000000000000000000fff999"]')).not.toBeNull();
        expect(container.textContent || '').toContain('abcde123...fff999');
        expect((container.textContent || '').includes('...')).toBe(true);
    });

    test('renders deterministic nested quota with embedded + 3 references', async () => {
        const note: NoteCardModel = {
            ...defaultNoteFixture,
            id: 'parent-with-embedded-and-refs',
            content: 'top-level',
            embedded: createNestedNote({ id: 'embedded-1', content: 'embedded visible' }),
            referencedNotes: [
                createNestedNote({ id: 'ref-1', content: 'reference visible 1' }),
                createNestedNote({ id: 'ref-2', content: 'reference visible 2' }),
                createNestedNote({ id: 'ref-3', content: 'reference hidden 3' }),
            ],
        };

        const { container } = await renderNoteCard(note);
        const text = container.textContent || '';

        expect(text).toContain('embedded visible');
        expect(text).toContain('reference visible 1');
        expect(text).toContain('reference visible 2');
        expect(text).toContain('+1 referencias adicionales');
        expect(text).not.toContain('reference hidden 3');
    });

    test('renders deterministic nested quota with 3 references and no embedded note', async () => {
        const note: NoteCardModel = {
            ...defaultNoteFixture,
            id: 'parent-with-refs-only',
            content: 'top-level',
            referencedNotes: [
                createNestedNote({ id: 'ref-only-1', content: 'reference only visible 1' }),
                createNestedNote({ id: 'ref-only-2', content: 'reference only visible 2' }),
                createNestedNote({ id: 'ref-only-3', content: 'reference only hidden 3' }),
            ],
        };

        const { container } = await renderNoteCard(note);
        const text = container.textContent || '';

        expect(text).toContain('reference only visible 1');
        expect(text).toContain('reference only visible 2');
        expect(text).toContain('+1 referencias adicionales');
        expect(text).not.toContain('reference only hidden 3');
    });

    test('depth >= 2 compact fallback consumes nested quota and keeps accessible CTA', async () => {
        const deepReferencedNote = createNestedNote({
            id: 'abcdef12aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00123456',
            content: 'y'.repeat(160),
            nestingLevel: 2,
        });
        const note: NoteCardModel = {
            ...defaultNoteFixture,
            id: 'parent-with-deep-reference',
            referencedNotes: [
                deepReferencedNote,
                createNestedNote({ id: 'ref-after-deep-1', content: 'after deep visible 1' }),
                createNestedNote({ id: 'ref-after-deep-2', content: 'after deep hidden 2' }),
            ],
        };

        const { container } = await renderNoteCard(note);
        const text = container.textContent || '';

        expect(text).toContain('Nota referenciada');
        expect(container.querySelector(`button[aria-label="Abrir nota referenciada ${deepReferencedNote.id}"]`)).not.toBeNull();
        expect(text).toContain('+1 referencias adicionales');
        expect(text).toContain('after deep visible 1');
        expect(text).not.toContain('after deep hidden 2');
    });

    test('depth >= 2 compact fallback hides open button when onSelectEventReference is undefined', async () => {
        const note: NoteCardModel = {
            ...deepNestedFixture,
            id: 'abcdef12aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00123456',
            content: 'z'.repeat(200),
        };
        const onCopyNoteId = vi.fn();
        const rendered = await renderElement(
            <NoteCard
                note={note}
                profilesByPubkey={{}}
                onCopyNoteId={onCopyNoteId}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector(`button[aria-label="Abrir nota referenciada ${note.id}"]`)).toBeNull();
    });

    test('copy id button triggers callback', async () => {
        const { container, onCopyNoteId } = await renderDefault();
        const menuButton = container.querySelector('button[aria-label="Abrir acciones para la nota note-1"]') as HTMLButtonElement;

        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Copiar'
        ) as HTMLElement;

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNoteId).toHaveBeenCalledWith('note-1');
    });

    test('note action menu exposes view detail action when available', async () => {
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onViewDetail,
            },
        });
        const menuButton = container.querySelector('button[aria-label="Abrir acciones para la nota note-1"]') as HTMLButtonElement;

        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const detailItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ver detalle'
        ) as HTMLElement;

        await act(async () => {
            detailItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onViewDetail).toHaveBeenCalledTimes(1);
    });

    test('note menu exposes view detail action when available', async () => {
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onViewDetail,
            },
        });
        const menuButton = container.querySelector('button[aria-label="Abrir acciones para la nota note-1"]') as HTMLButtonElement;

        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const detailItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ver detalle'
        ) as HTMLElement;

        await act(async () => {
            detailItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onViewDetail).toHaveBeenCalledTimes(1);
    });
});
