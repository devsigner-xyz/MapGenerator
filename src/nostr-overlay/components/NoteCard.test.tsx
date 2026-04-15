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
        expect(container.querySelector('button[aria-label="Copiar identificador de nota note-1"]')).not.toBeNull();
    });

    test('nested depth >= 2 renders compact fallback with open reference button', async () => {
        const { container } = await renderDeep();

        expect(container.textContent || '').toContain('Nota referenciada');
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Abrir nota referenciada abcde123000000000000000000000000000000000000000000000000fff999"]')).not.toBeNull();
        expect(container.textContent || '').toContain('abcde123...fff999');
        expect((container.textContent || '').includes('...')).toBe(true);
    });

    test('copy id button triggers callback', async () => {
        const { container, onCopyNoteId } = await renderDefault();
        const copyButton = container.querySelector('button[aria-label="Copiar identificador de nota note-1"]') as HTMLButtonElement;

        await act(async () => {
            copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNoteId).toHaveBeenCalledWith('note-1');
    });
});
