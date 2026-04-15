# Note Cards Shadcn Feeds Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar el render de notas en Agora y en el feed del dialogo de perfil con base `Card` + `Item` + `ButtonGroup` de shadcn, incluyendo reposts/citas anidadas con reglas de profundidad.

**Architecture:** Se introduce un `NoteCard` reutilizable con un modelo de render comun (`NoteCardModel`) y adaptadores por origen (`SocialFeedItem`, `SocialThreadItem`, `NostrPostPreview`, referencias resueltas, repost embebido). `FollowingFeedContent` y `OccupantProfileDialog` delegan en `NoteCard`, y `RichNostrContent` delega el render de referencias a `NoteCard` manteniendo su responsabilidad de resolucion de referencias.

**Tech Stack:** React 19, TypeScript, shadcn/ui (`Card`, `Item`, `ButtonGroup`, `Button`, `Avatar`), Vitest.

---

## File Structure (locked before tasks)

### Create

- `src/nostr-overlay/components/note-card-model.ts`
  - Tipos puros: `NoteCardModel`, `NoteActionState`, `NoteCardVariant`.
  - Helpers puros para labels/short ids.
- `src/nostr-overlay/components/note-card-adapters.ts`
  - Adaptadores puros: `fromFeedItem`, `fromThreadItem`, `fromPostPreview`, `fromEmbeddedRepost`, `fromResolvedReferenceEvent`.
- `src/nostr-overlay/components/NoteCard.tsx`
  - Presentacion de nota con `Card` + `Item` + `ButtonGroup`.
  - Reglas de variante y nested depth fallback.
- `src/nostr-overlay/components/NoteCard.test.tsx`
  - Pruebas unitarias del componente base y fallback depth >=2.
- `src/nostr-overlay/components/note-card-adapters.test.ts`
  - Pruebas unitarias de defaults, null-safety y reglas de adaptacion.
- `src/nostr-overlay/components/following-feed-note-card-mappers.ts`
  - Helpers puros para construir `actions` de feed/root/reply y evitar inflar `FollowingFeedContent.tsx`.

### Modify

- `src/nostr-overlay/components/FollowingFeedContent.tsx`
  - Reemplazar bloques duplicados de card/feed/thread por `NoteCard`.
- `src/nostr-overlay/components/RichNostrContent.tsx`
  - Exponer hook de render de referencias para delegar en `NoteCard`.
- `src/nostr-overlay/components/OccupantProfileDialog.tsx`
  - Reemplazar lista custom de posts por `NoteCard` en tab feed.
- `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Ajustar asserts y agregar casos de parseo fallido + referencias anidadas.
- `src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
  - Ajustar al nuevo formato y validar ausencia de acciones mutantes en contexto readonly.
- `src/nostr-overlay/styles.css`
  - Reducir estilos custom de card redundantes; mantener solo wrappers de layout.

---

## Chunk 1: Base reusable note card + adapters (TDD)

Skills: `@vitest` `@shadcn`

### Task 1: Implementar modelo comun y adaptadores puros

**Files:**
- Create: `src/nostr-overlay/components/note-card-model.ts`
- Create: `src/nostr-overlay/components/note-card-adapters.ts`
- Create: `src/nostr-overlay/components/note-card-adapters.test.ts`

- [x] **Step 1: Escribir tests RED para adaptadores y defaults**

```ts
import { describe, expect, test } from 'vitest'
import {
  fromFeedItem,
  fromThreadItem,
  fromPostPreview,
  fromEmbeddedRepost,
  fromResolvedReferenceEvent,
} from './note-card-adapters'

const feedItemFixture = {
  id: 'note-1',
  pubkey: 'a'.repeat(64),
  createdAt: 100,
  content: 'hola',
  kind: 'note' as const,
  rawEvent: { id: 'note-1', pubkey: 'a'.repeat(64), kind: 1, created_at: 100, tags: [], content: 'hola' },
}
const rootFixture = { id: 'root-1', pubkey: 'b'.repeat(64), createdAt: 101, content: 'root', eventKind: 1, rawEvent: { id: 'root-1', pubkey: 'b'.repeat(64), kind: 1, created_at: 101, tags: [], content: 'root' } }
const replyFixture = { id: 'reply-1', pubkey: 'c'.repeat(64), createdAt: 102, content: 'reply', eventKind: 1, rawEvent: { id: 'reply-1', pubkey: 'c'.repeat(64), kind: 1, created_at: 102, tags: [], content: 'reply' } }
const referenceEventFixture = { id: 'ref-1', pubkey: 'd'.repeat(64), kind: 1, created_at: 103, tags: [], content: 'referencia' }
const validEmbeddedFixture = { id: 'emb-1', pubkey: 'e'.repeat(64), createdAt: 99, content: 'embedded', tags: [] as string[][] }
const actionStateFixture = { canWrite: true, isReactionActive: false, isRepostActive: false, isReactionPending: false, isRepostPending: false, replies: 1, reactions: 2, reposts: 3, zapSats: 210, onReply: () => {}, onToggleReaction: async () => true, onToggleRepost: async () => true }

test('fromPostPreview sets readonly defaults', () => {
  const model = fromPostPreview({ id: 'p1', pubkey: 'a'.repeat(64), createdAt: 100, content: 'hola' })
  expect(model?.tags).toEqual([])
  expect(model?.actions).toBeUndefined()
  expect(model?.showCopyId).toBe(true)
  expect(model?.nestingLevel).toBe(0)
})

test('fromPostPreview returns null on missing critical fields', () => {
  expect(fromPostPreview({ id: '', pubkey: 'a'.repeat(64), createdAt: 100, content: 'hola' } as any)).toBeNull()
})

test('fromFeedItem maps engagement actions contract', () => {
  const model = fromFeedItem(feedItemFixture, actionStateFixture)
  expect(model?.variant).toBe('default')
  expect(model?.kindLabel).toBeUndefined()
  expect(model?.showCopyId).toBe(true)
  expect(model?.nestingLevel).toBe(0)
  expect(model?.tags).toEqual([])
  expect(model?.actions?.canWrite).toBe(true)
  expect(typeof model?.actions?.onToggleReaction).toBe('function')
})

test('fromThreadItem maps root/reply labels', () => {
  expect(fromThreadItem(rootFixture, 'root', actionStateFixture)?.kindLabel).toBe('Raiz')
  expect(fromThreadItem(rootFixture, 'root', actionStateFixture)?.showCopyId).toBe(true)
  expect(fromThreadItem(replyFixture, 'reply', actionStateFixture)?.kindLabel).toBe('Reply')
  expect(fromThreadItem(replyFixture, 'reply', actionStateFixture)?.nestingLevel).toBe(0)
})

test('fromResolvedReferenceEvent returns nested readonly model', () => {
  const model = fromResolvedReferenceEvent(referenceEventFixture, 1)
  expect(model?.variant).toBe('nested')
  expect(model?.showCopyId).toBe(true)
  expect(model?.nestingLevel).toBe(1)
  expect(model?.actions).toBeUndefined()
})

test('fromResolvedReferenceEvent defaults nestingLevel to 1', () => {
  const model = fromResolvedReferenceEvent(referenceEventFixture)
  expect(model?.nestingLevel).toBe(1)
})

test('fromEmbeddedRepost returns nested readonly model on valid payload', () => {
  const model = fromEmbeddedRepost(validEmbeddedFixture, 1)
  expect(model?.variant).toBe('nested')
  expect(model?.showCopyId).toBe(true)
  expect(model?.nestingLevel).toBe(1)
  expect(model?.actions).toBeUndefined()
})

test('adapters return null when critical fields are missing', () => {
  expect(fromResolvedReferenceEvent({ ...referenceEventFixture, id: '' }, 1)).toBeNull()
  expect(fromEmbeddedRepost({ ...validEmbeddedFixture, pubkey: '' }, 1)).toBeNull()
})

test('fromEmbeddedRepost returns null on invalid payload', () => {
  expect(fromEmbeddedRepost({ id: '', pubkey: '', createdAt: Number.NaN, content: '', tags: [] })).toBeNull()
})
```

- [x] **Step 2: Ejecutar tests para verificar RED**
  - Run: `pnpm vitest run src/nostr-overlay/components/note-card-adapters.test.ts`
  - Expected: FAIL por funciones/archivos aun no implementados.

- [x] **Step 3: Implementar tipos y adaptadores minimos para pasar tests**

Checklist obligatorio de exportes en este paso:
- `fromFeedItem(...)`
- `fromThreadItem(...)`
- `fromPostPreview(...)`
- `fromEmbeddedRepost(...)`
- `fromResolvedReferenceEvent(...)`

Distribucion por archivo (obligatoria):
- `note-card-model.ts`: `NoteCardVariant`, `NoteActionState`, `NoteCardModel`, `shortId`, `kindLabel`.
- `note-card-adapters.ts`: solo adaptadores (`fromFeedItem`, `fromThreadItem`, `fromPostPreview`, `fromEmbeddedRepost`, `fromResolvedReferenceEvent`).

```ts
export type NoteCardVariant = 'default' | 'root' | 'reply' | 'nested'

export interface NoteActionState {
  canWrite: boolean
  isReactionActive: boolean
  isRepostActive: boolean
  isReactionPending: boolean
  isRepostPending: boolean
  replies: number
  reactions: number
  reposts: number
  zapSats: number
  onReply: () => void
  onToggleReaction: () => Promise<boolean>
  onToggleRepost: () => Promise<boolean>
}

export interface NoteCardModel {
  id: string
  pubkey: string
  createdAt: number
  content: string
  tags: string[][]
  variant: NoteCardVariant
  showCopyId: boolean
  nestingLevel: number
  kindLabel?: string
  actions?: NoteActionState
  embedded?: NoteCardModel
  referencedNotes?: NoteCardModel[]
}

export function shortId(value: string): string {
  return value.length >= 14 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value
}

export function kindLabel(input: { variant: NoteCardVariant; isRepost?: boolean }): string | undefined {
  if (input.variant === 'root') return 'Raiz'
  if (input.variant === 'reply') return 'Reply'
  if (input.isRepost) return 'Repost'
  return undefined
}

export function fromPostPreview(post: NostrPostPreview): NoteCardModel | null {
  if (!post?.id || !post?.pubkey || !Number.isFinite(post?.createdAt)) {
    return null
  }

  return {
    id: post.id,
    pubkey: post.pubkey,
    createdAt: post.createdAt,
    content: post.content,
    tags: [],
    variant: 'default',
    showCopyId: true,
    nestingLevel: 0,
  }
}

export function fromResolvedReferenceEvent(event: NostrEvent, nestingLevel = 1): NoteCardModel | null {
  if (!event?.id || !event?.pubkey || !Number.isFinite(event?.created_at)) {
    return null
  }

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content: event.content || '',
    tags: event.tags || [],
    variant: 'nested',
    showCopyId: true,
    nestingLevel,
  }
}

export function fromFeedItem(item: SocialFeedItem, actions?: NoteActionState): NoteCardModel | null {
  if (!item?.id || !item?.pubkey || !Number.isFinite(item?.createdAt)) return null
  return { id: item.id, pubkey: item.pubkey, createdAt: item.createdAt, content: item.content || '', tags: item.rawEvent?.tags || [], variant: 'default', showCopyId: true, nestingLevel: 0, kindLabel: item.kind === 'repost' ? 'Repost' : undefined, actions }
}

export function fromThreadItem(item: SocialThreadItem, variant: 'root' | 'reply', actions?: NoteActionState): NoteCardModel | null {
  if (!item?.id || !item?.pubkey || !Number.isFinite(item?.createdAt)) return null
  return { id: item.id, pubkey: item.pubkey, createdAt: item.createdAt, content: item.content || '', tags: item.rawEvent?.tags || [], variant, showCopyId: true, nestingLevel: 0, kindLabel: variant === 'root' ? 'Raiz' : 'Reply', actions }
}

export function fromEmbeddedRepost(input: { id: string; pubkey: string; createdAt: number; content: string; tags: string[][] }, nestingLevel = 1): NoteCardModel | null {
  if (!input?.id || !input?.pubkey || !Number.isFinite(input?.createdAt)) return null
  return { id: input.id, pubkey: input.pubkey, createdAt: input.createdAt, content: input.content || '', tags: input.tags || [], variant: 'nested', showCopyId: true, nestingLevel }
}
```

- [x] **Step 4: Re-ejecutar tests del adaptador**
  - Run: `pnpm vitest run src/nostr-overlay/components/note-card-adapters.test.ts`
  - Expected: PASS.

- [x] **Step 5: Commit del task**

```bash
git add src/nostr-overlay/components/note-card-model.ts src/nostr-overlay/components/note-card-adapters.ts src/nostr-overlay/components/note-card-adapters.test.ts
git commit -m "refactor(agora): add note card model and adapters"
```

### Task 2: Crear `NoteCard` reusable con shadcn y cobertura unitaria

**Files:**
- Create: `src/nostr-overlay/components/NoteCard.tsx`
- Create: `src/nostr-overlay/components/NoteCard.test.tsx`

- [x] **Step 1: Escribir tests RED de estructura y variantes**

```ts
const defaultNoteFixture = { id: 'note-1', pubkey: 'a'.repeat(64), createdAt: 100, content: 'hola', tags: [], variant: 'default', showCopyId: true, nestingLevel: 0, actions: { canWrite: true, isReactionActive: false, isRepostActive: false, isReactionPending: false, isRepostPending: false, replies: 1, reactions: 3, reposts: 2, zapSats: 210, onReply: () => {}, onToggleReaction: async () => true, onToggleRepost: async () => true } }
const deepNestedFixture = { id: 'abcde123000000000000000000000000000000000000000000000000fff999', pubkey: 'b'.repeat(64), createdAt: 99, content: 'x'.repeat(150), tags: [], variant: 'nested', showCopyId: true, nestingLevel: 2 }

async function renderNoteCard(note = defaultNoteFixture) {
  const onCopyNoteId = vi.fn()
  const { container } = await renderElement(<NoteCard note={note} profilesByPubkey={{}} onCopyNoteId={onCopyNoteId} onSelectEventReference={() => {}} />)
  return { container, onCopyNoteId }
}

describe('NoteCard', () => {
  async function renderDefault() {
    return await renderNoteCard(defaultNoteFixture)
  }

  async function renderDeep() {
    return await renderNoteCard(deepNestedFixture)
  }

test('renders author header via item and actions via button group', async () => {
  const { container } = await renderDefault()
  expect(container.querySelector('article')).not.toBeNull()
  expect(container.querySelector('time[datetime]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="Responder (1)"]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="Reaccionar (3)"]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="Repostear (2)"]')).not.toBeNull()
  expect(container.querySelector('[aria-label="Sats recibidos: 210"]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="Copiar identificador de nota note-1"]')).not.toBeNull()
})

test('nested depth >= 2 renders compact fallback with open reference button', async () => {
  const { container } = await renderDeep()
  expect(container.textContent || '').toContain('Nota referenciada')
  expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="Abrir nota referenciada abcde123000000000000000000000000000000000000000000000000fff999"]')).not.toBeNull()
  expect(container.textContent || '').toContain('abcde123...fff999')
  expect((container.textContent || '').includes('...')).toBe(true)
})

test('copy id button triggers callback', async () => {
  const { container, onCopyNoteId } = await renderDefault()
  const copyButton = container.querySelector('button[aria-label="Copiar identificador de nota note-1"]') as HTMLButtonElement
  copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(onCopyNoteId).toHaveBeenCalledWith('note-1')
})
})
```

- [x] **Step 2: Ejecutar tests del componente para confirmar RED**
  - Run: `pnpm vitest run src/nostr-overlay/components/NoteCard.test.tsx`
  - Expected: FAIL.

- [x] **Step 3: Implementar `NoteCard` con `Card` + `Item` + `ButtonGroup`**

Descomposicion interna obligatoria para mantener responsabilidades claras:
- `NoteHeaderItem` (avatar/nombre/time/meta)
- `NoteActionGroup` (reply/reaction/repost/zap)

```tsx
<Card size={note.variant === 'nested' ? 'sm' : 'default'}>
  <CardHeader>
    <Item>
      <ItemMedia><Avatar /></ItemMedia>
      <ItemContent><ItemTitle>{author}</ItemTitle></ItemContent>
    </Item>
  </CardHeader>
<CardContent>
    {note.nestingLevel >= 2 ? (
      <div>
        <p>Nota referenciada</p>
        <p>{truncateTo140(note.content)}</p>
        <p>{shortId(note.id)}</p>
        {onSelectEventReference ? <Button aria-label={`Abrir nota referenciada ${note.id}`} /> : null}
      </div>
    ) : (
      <RichNostrContent content={note.content} tags={note.tags} />
    )}
  </CardContent>
  {note.actions ? (
    <CardFooter>
      <ButtonGroup>
        <Button aria-label={`Responder (${note.actions.replies})`} />
        <Button aria-label={`Reaccionar (${note.actions.reactions})`} />
        <Button aria-label={`Repostear (${note.actions.reposts})`} />
        <span aria-label={`Sats recibidos: ${note.actions.zapSats}`}>{note.actions.zapSats}</span>
      </ButtonGroup>
    </CardFooter>
  ) : null}
</Card>
```

- [x] **Step 4: Ejecutar tests de NoteCard**
  - Run: `pnpm vitest run src/nostr-overlay/components/NoteCard.test.tsx`
  - Expected: PASS.

- [x] **Step 5: Commit del task**

```bash
git add src/nostr-overlay/components/NoteCard.tsx src/nostr-overlay/components/NoteCard.test.tsx
git commit -m "feat(agora): add reusable shadcn note card component"
```

- [x] **Step 6: Verificacion del chunk 1 (al final del chunk)**
  - Run: `pnpm vitest run src/nostr-overlay/components/note-card-adapters.test.ts src/nostr-overlay/components/NoteCard.test.tsx && pnpm typecheck`
  - Expected: PASS.

---

## Chunk 2: Integrar `NoteCard` en Agora feed y thread

Skills: `@vitest` `@shadcn`

### Task 3: Reemplazar markup duplicado en `FollowingFeedContent`

**Files:**
- Create: `src/nostr-overlay/components/following-feed-note-card-mappers.ts`
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [x] **Step 1: Escribir/ajustar tests RED de surface para nuevo render base**
  - Cambiar assert fragil `.nostr-following-feed-card-time` por `time[datetime]`.
  - Agregar caso RED: repost embebido valido renderiza nested con contenido citado visible.
  - Agregar caso RED: parseo fallido de repost embebido mantiene texto plano y no crashea.
  - Agregar casos RED: root/reply del hilo siguen renderizando acciones y callbacks (`onPublishReply`, `onToggleReaction`, `onToggleRepost`).
  - Agregar caso RED: estados pending en root/reply mantienen botones disabled.
  - Agregar caso RED: `canWrite=false` deshabilita reaction/repost en feed y thread.
  - Agregar caso RED: `onCopyNoteId` sigue disparando callback en feed y en hilo.

```ts
expect(container.querySelector('time[datetime]')).not.toBeNull()
expect(container.textContent || '').toContain('nota citada')
expect(container.textContent || '').toContain('contenido raw de repost')
expect(container.querySelector('button[aria-label="Reaccionar (7)"]')?.hasAttribute('disabled')).toBe(true)
expect(container.querySelector('[aria-label="Sats recibidos: 210"]')).not.toBeNull()
expect(onPublishReply).toHaveBeenCalledWith({ targetEventId: 'root-1', targetPubkey: 'b'.repeat(64), rootEventId: 'root-1', content: 'respuesta surface' })
expect(onCopyNoteId).toHaveBeenCalledWith('repost-no-comment')
expect(onCopyNoteId).toHaveBeenCalledWith('root-1')
expect(container.querySelector('button[aria-label="Reaccionar (3)"]')?.hasAttribute('disabled')).toBe(true)
```

- [x] **Step 2: Ejecutar tests RED de surface**
  - Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Expected: FAIL en asserts nuevos.

- [x] **Step 3: Migrar `FollowingFeedContent` a modelo/adaptadores + `NoteCard`**
  - Sustituir card del feed, root y replies por `NoteCard`.
  - Eliminar `FeedActionBar` inline y mapear acciones al modelo.

Subpaso A (split para no crecer archivo grande):
- Crear `following-feed-note-card-mappers.ts` con helpers puros:
  - `buildFeedActionState(...)`
  - `buildRootActionState(...)`
  - `buildReplyActionState(...)`
- `FollowingFeedContent.tsx` solo orquesta render y llama helpers.

Checklist de mapeo obligatorio en este paso:
- Politica de firma final: `fromThreadItem(item, variant, actions?)` (tercer parametro opcional para readonly/writeable).
- `fromFeedItem(item, actionState)` en lista principal.
- `fromThreadItem(activeThread.root, 'root', actionState)` para raiz.
- `fromThreadItem(reply, 'reply', actionState)` para replies.
- `actionState` debe incluir: `canWrite`, `isReactionActive`, `isRepostActive`, `isReactionPending`, `isRepostPending`, `replies`, `reactions`, `reposts`, `zapSats`, `onReply`, `onToggleReaction`, `onToggleRepost`.
- Mapeo de `onReply` por contexto:
  - feed: `onReply => onOpenThread(targetEventId || id)`
  - root de hilo: `onReply => setReplyTargetEventId(root.id)` + `setReplyTargetPubkey(root.pubkey)`
  - reply en hilo: `onReply => setReplyTargetEventId(reply.id)` + `setReplyTargetPubkey(reply.pubkey)`

```tsx
const actionState = {
  canWrite,
  isReactionActive,
  isRepostActive,
  isReactionPending,
  isRepostPending,
  replies: metrics.replies,
  reactions: metrics.reactions,
  reposts: metrics.reposts,
  zapSats: metrics.zapSats,
  onReply: () => void onOpenThread(item.targetEventId || item.id),
  onToggleReaction: () => onToggleReaction({ eventId: item.id, targetPubkey: item.pubkey }),
  onToggleRepost: () => onToggleRepost({ eventId: item.id, targetPubkey: item.pubkey, repostContent: item.content }),
}
const noteModel = fromFeedItem(item, actionState)
return <NoteCard note={noteModel} profilesByPubkey={profilesByPubkey} onCopyNoteId={onCopyNoteId} />

const rootActionState = {
  ...actionState,
  onReply: () => {
    setReplyTargetEventId(activeThread.root?.id || null)
    setReplyTargetPubkey(activeThread.root?.pubkey)
  },
}

const replyActionState = {
  ...actionState,
  onReply: () => {
    setReplyTargetEventId(reply.id)
    setReplyTargetPubkey(reply.pubkey)
  },
}
```

- [x] **Step 4: Ejecutar tests de surface tras migracion**
  - Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Expected: PASS con evidencia de:
    - feed/root/reply renderizados con `article` y `time[datetime]`
    - callbacks de reply/reaction/repost intactos
    - indicador de zaps visible en feed y root/reply
    - pending states intactos
    - repost embebido exitoso y fallback por parseo fallido
    - callback `onCopyNoteId` intacto
    - parseo fallido de repost sin crash

- [x] **Step 5: Ejecutar typecheck del chunk 2**
  - Run: `pnpm typecheck`
  - Expected: PASS.

- [x] **Step 6: Commit del task**

```bash
git add src/nostr-overlay/components/following-feed-note-card-mappers.ts src/nostr-overlay/components/FollowingFeedContent.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx
git commit -m "refactor(agora): render feed and thread notes with NoteCard"
```

---

## Chunk 3: Delegacion de referencias y reglas de nested depth

Skills: `@vitest`

### Task 4: Delegar render de referencias desde `RichNostrContent` a `NoteCard`

**Files:**
- Modify: `src/nostr-overlay/components/RichNostrContent.tsx`
- Modify: `src/nostr-overlay/components/NoteCard.tsx`
- Modify: `src/nostr-overlay/components/NoteCard.test.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [x] **Step 1: Escribir tests RED para orden y cupo determinista de nested**
  - Caso: `embedded + 3 referencias` => visible `1 embedded + 2 referencias` + `+1 referencias adicionales`.
  - Caso: sin `embedded`, con `3 referencias` => visible maximo `2 referencias` + `+1 referencias adicionales`.
  - Caso: depth >=2 => fallback compacto consume cupo y usa CTA accesible.
  - Caso: referencia no resuelta en intentos disponibles muestra `Cargando nota referenciada...` con `aria-live="polite"`.
  - Caso: referencia agotada muestra `No se pudo cargar la nota referenciada.` con `button[aria-label="Abrir nota referenciada <id>"]`.
  - Caso: fallback compacto depth >=2 incluye ID corto (`abcdef12...123456`) y resumen truncado a 140 chars con sufijo `...`.
  - Caso: sin `onSelectEventReference` no se renderiza boton `Abrir nota referenciada <id>`.
  - Caso: referencias mixtas (1 resuelta + 1 no resuelta) renderiza ambas, sin bloquear la resuelta.

- [x] **Step 2: Ejecutar tests RED**
  - Run: `pnpm vitest run src/nostr-overlay/components/NoteCard.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Expected: FAIL.

- [x] **Step 3: Implementar API de render de referencias en `RichNostrContent` y wiring en `NoteCard`**

Subpaso A (API en `RichNostrContent`):

```ts
interface RichNostrContentProps {
  content: string
  tags?: string[][]
  onSelectEventReference?: (eventId: string) => void
  onResolveEventReferences?: (
    eventIds: string[],
    options?: { relayHintsByEventId?: Record<string, string[]> }
  ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void
  eventReferencesById?: Record<string, NostrEvent>
  renderEventReferenceCard?: (input: { eventId: string; event?: NostrEvent }) => ReactNode
}
```

Subpaso B (wiring en `NoteCard`):

```tsx
<RichNostrContent
  content={note.content}
  tags={note.tags}
  onSelectEventReference={onSelectEventReference}
  onResolveEventReferences={onResolveEventReferences}
  eventReferencesById={eventReferencesById}
  renderEventReferenceCard={({ eventId, event }) => renderNestedReference(eventId, event, note.nestingLevel + 1)}
/>
```

Subpaso C (regla de cupo):
- Aplicar maximo 3 nested visibles por nota.
- Limitar referencias visibles a maximo 2 por nota (independiente de si existe `embedded`).
- Contar fallback compacto como 1 unidad.
- Prioridad: `embedded` primero, luego referencias por orden de aparicion.
- Excedente: `+N referencias adicionales`.

Subpaso D (boundary de ownership):
- Mantener `NoteCard` como presentacional puro: no fetch, no timers, no retries.
- Mantener retries/resolve en `RichNostrContent`.
- Mover logica de cupo/prioridad/truncado a helper puro interno (ej. `buildVisibleNestedEntries(...)`) para no crecer JSX.

- [x] **Step 4: Ejecutar tests del chunk**
  - Run: `pnpm vitest run src/nostr-overlay/components/NoteCard.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Expected: PASS con evidencia de:
    - `Cargando nota referenciada...` con `aria-live="polite"`
    - `No se pudo cargar la nota referenciada.` en fallback agotado
    - CTA condicional segun exista/no exista `onSelectEventReference`
    - `+N referencias adicionales` cuando supera cupo

- [x] **Step 5: Ejecutar typecheck del chunk 3**
  - Run: `pnpm typecheck`
  - Expected: PASS.

- [x] **Step 6: Commit del task**

```bash
git add src/nostr-overlay/components/RichNostrContent.tsx src/nostr-overlay/components/NoteCard.tsx src/nostr-overlay/components/NoteCard.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx
git commit -m "refactor(agora): render quoted references through NoteCard"
```

---

## Chunk 4: Integrar dialog feed + cleanup CSS + verificacion final

Skills: `@vitest` `@shadcn`

### Task 5: Migrar tab feed de `OccupantProfileDialog` a `NoteCard`

**Files:**
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.tsx`
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.test.tsx`

- [x] **Step 1: Escribir tests RED del feed de perfil con formato unificado**
  - Cambiar dependencia de `.nostr-profile-post-item` por semantica estable (`article`, `time`, `aria-label`).
  - Agregar assert: en perfil no se muestran acciones mutantes (reaction/repost/reply).
  - Agregar assert RED: referencias `nevent` en perfil se renderizan con formato unificado (mismo header/meta que `NoteCard` nested).

```ts
expect(document.body.querySelector('article')).not.toBeNull()
expect(document.body.querySelector('time[datetime]')).not.toBeNull()
expect(document.body.querySelectorAll('article').length).toBeGreaterThanOrEqual(2)
expect(document.body.querySelectorAll('time[datetime]').length).toBeGreaterThanOrEqual(2)
expect(document.body.querySelector('button[aria-label^="Reaccionar ("]')).toBeNull()
expect(document.body.querySelector('button[aria-label^="Repostear ("]')).toBeNull()
expect(document.body.querySelector('button[aria-label^="Responder ("]')).toBeNull()
expect(document.body.querySelector(`button[aria-label="Copiar identificador de nota ${postId}"]`)).not.toBeNull()
expect(document.body.querySelector(`button[aria-label="Copiar identificador de nota post-event-ref-1"]`)).not.toBeNull()
expect(document.body.textContent || '').toContain('@Nina Referencia')
```

- [x] **Step 2: Ejecutar tests RED del dialogo**
  - Run: `pnpm vitest run src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
  - Expected: FAIL.

- [x] **Step 3: Implementar migracion del tab feed a `NoteCard`**

```tsx
{posts.map((post) => {
  const note = fromPostPreview(post)
  if (!note) {
    return (
      <article key={post.id}>
        <p>No se pudo renderizar la nota.</p>
      </article>
    )
  }

  return (
    <NoteCard
      key={post.id}
      note={note}
      profilesByPubkey={profilesByPubkey || {}}
      onSelectHashtag={onSelectHashtag}
      onSelectProfile={onSelectProfile}
      onResolveProfiles={onResolveProfiles}
      onSelectEventReference={onSelectEventReference}
      onResolveEventReferences={onResolveEventReferences}
      eventReferencesById={eventReferencesById}
    />
  )
})}
```

Matriz readonly obligatoria en este paso:
- `actions` debe quedar `undefined` en `fromPostPreview`.
- No renderizar `ButtonGroup` de mutaciones en tab feed perfil.
- Mantener `copy ID` visible.

- [x] **Step 4: Ejecutar tests del dialogo**
  - Run: `pnpm vitest run src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
  - Expected: PASS.

- [x] **Step 5: Commit del task**

```bash
git add src/nostr-overlay/components/OccupantProfileDialog.tsx src/nostr-overlay/components/OccupantProfileDialog.test.tsx
git commit -m "refactor(profile): use NoteCard in profile feed tab"
```

### Task 6: Cleanup de estilos redundantes y verificacion integral

**Files:**
- Modify: `src/nostr-overlay/styles.css`
- Modify if needed: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify if needed: `src/nostr-overlay/components/OccupantProfileDialog.tsx`
- Modify if needed: `src/nostr-overlay/components/RichNostrContent.tsx`
- Modify if needed: `src/nostr-overlay/components/NoteCard.tsx`

- [x] **Step 1: Reducir estilos custom de card a wrappers necesarios**
  - Remover selectores redundantes de card:
    - `.nostr-following-feed-card`
    - `.nostr-following-feed-card-root`
    - `.nostr-following-feed-card-head`
    - `.nostr-following-feed-card-avatar`
    - `.nostr-following-feed-card-head-copy`
    - `.nostr-following-feed-card-head-main`
    - `.nostr-following-feed-card-head-top`
    - `.nostr-following-feed-card-author`
    - `.nostr-following-feed-card-meta`
    - `.nostr-following-feed-card-time`
    - `.nostr-following-feed-card-id`
    - `.nostr-following-feed-card-kind`
    - `.nostr-following-feed-card-embedded`
    - `.nostr-following-feed-card-embedded-avatar`
    - `.nostr-following-feed-card-actions`
    - `.nostr-profile-post-item`
  - Mantener wrappers de layout:
    - `.nostr-following-feed-list`
    - `.nostr-following-feed-thread-list`
    - `.nostr-profile-post-list`
    - reglas de scroll/empty/error existentes.

- [x] **Step 2: Verificar que no queden className legacy en componentes**
  - Run: `rg "nostr-following-feed-card|nostr-profile-post-item" src/nostr-overlay/components src/nostr-overlay/styles.css --glob '!*.test.tsx'`
  - Expected: `0 matches`.
  - Si aparecen matches: remover classNames legacy en archivos reportados y repetir este paso hasta `0 matches`.

- [x] **Step 3: Verificar contratos en archivos marcados como Verify**
  - Run: `rg "<NoteCard|renderEventReferenceCard" src/nostr-overlay/components/FollowingFeedContent.tsx src/nostr-overlay/components/OccupantProfileDialog.tsx src/nostr-overlay/components/RichNostrContent.tsx`
  - Expected: `FollowingFeedContent.tsx` y `OccupantProfileDialog.tsx` contienen `<NoteCard`; `RichNostrContent.tsx` contiene `renderEventReferenceCard`.
  - Run: `rg "fetch\(|setTimeout\(|setInterval\(" src/nostr-overlay/components/NoteCard.tsx`
  - Expected: `0 matches` (sin efectos de red/timers en `NoteCard`).
  - `FollowingFeedContent.tsx`: no markup legacy de card y usa `NoteCard` en feed/root/replies.
  - `OccupantProfileDialog.tsx`: tab feed usa `NoteCard` en readonly.
  - `RichNostrContent.tsx`: delega referencias por `renderEventReferenceCard` sin fetch extra en `NoteCard`.
  - `NoteCard.tsx`: presentacional puro, solo render + callbacks recibidos.
  - Si alguno de los checks no cumple: corregir el archivo correspondiente y repetir Step 3 hasta cumplir todos los checks.

- [x] **Step 4: Ejecutar suite enfocada de componentes**
  - Run: `pnpm vitest run src/nostr-overlay/components/NoteCard.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
  - Expected: PASS.

- [x] **Step 5: Ejecutar typecheck**
  - Run: `pnpm typecheck`
  - Expected: PASS.

- [x] **Step 6: Commit de cierre del chunk 4 (solo cambios de este chunk)**

```bash
git add src/nostr-overlay/styles.css src/nostr-overlay/components/OccupantProfileDialog.tsx src/nostr-overlay/components/OccupantProfileDialog.test.tsx src/nostr-overlay/components/FollowingFeedContent.tsx src/nostr-overlay/components/RichNostrContent.tsx src/nostr-overlay/components/NoteCard.tsx
git commit -m "style(agora): remove legacy note card css after NoteCard migration"
```

---

## Execution Notes

- Mantener cambios acotados a los archivos listados.
- No introducir estados globales nuevos para las cards.
- Evitar assertions de tests basadas en clases visuales cuando exista equivalente semantico (`role`, `aria-label`, `time[datetime]`).
- Si aparece regresion no cubierta por spec, agregar test RED minimo antes de ajustar implementacion.
