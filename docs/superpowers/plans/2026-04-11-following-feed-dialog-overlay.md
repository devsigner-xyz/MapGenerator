# Following Feed Dialog Overlay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un icon button junto a settings/notificaciones/regenerar para abrir un dialog con feed de seguidos, scroll incremental, vista de hilo, reply, reaction, repost y publicacion de notas, dejando zaps fuera de alcance.

**Architecture:** Separar el feature en 3 capas: dominio Nostr social feed (tipos, filtros y runtime paginado), estado UI dedicado (`useFollowingFeed`) y presentacion (`FollowingFeedIconButton` + `FollowingFeedDialog`) integrada en toolbar expandida y compacta de `App`.

**Tech Stack:** React 19, TypeScript, Vitest, NDK transport existente, shadcn/ui (`Dialog`, `Button`, `Textarea`), CSS `nostr-*`.

---

## Chunk 1: Dominio Base Del Feed (filtros + contratos)

### Task 1: Extender filtros Nostr para hilos

**Files:**
- Modify: `src/nostr/types.ts`

- [x] **Step 1: agregar `#e?: string[]` en `NostrFilter`**
- [x] **Step 2: ejecutar typecheck puntual del dominio**
  - Run: `pnpm vitest run src/nostr/posts.test.ts`
  - Expected: PASS

### Task 2: Crear contrato de dominio social feed

**Files:**
- Create: `src/nostr/social-feed-service.ts`

- [x] **Step 1: definir tipos de feed/hilo/paginacion**
- [x] **Step 2: definir helpers puros para clasificar eventos**
  - `isMainFeedEvent` (solo notas no-reply y reposts)
  - `isReplyEvent` (solo kind 1 con tags de respuesta)
  - `extractTargetEventId` (para reply/repost)

### Task 3: TDD del dominio base

**Files:**
- Create: `src/nostr/social-feed-service.test.ts`

- [x] **Step 1: escribir tests en rojo para clasificacion (main feed vs reply)**
- [x] **Step 2: ejecutar tests y verificar fallo esperado**
  - Run: `pnpm test:unit -- src/nostr/social-feed-service.test.ts` (red control)
  - Expected: FAIL (helpers no implementados)
- [x] **Step 3: implementar minimo para verde en `social-feed-service.ts`**
- [x] **Step 4: ejecutar tests y verificar verde**
  - Run: `pnpm vitest run src/nostr/social-feed-service.test.ts`
  - Expected: PASS

## Chunk 2: Runtime Social Feed (timeline + hilo)

### Task 4: Runtime service paginado

**Files:**
- Create: `src/nostr/social-feed-runtime-service.ts`
- Create: `src/nostr/social-feed-runtime-service.test.ts`

- [x] **Step 1: cargar feed principal de follows con cursor `until`**
- [x] **Step 2: excluir replies del feed principal**
- [x] **Step 3: resolver hilo por evento raiz + replies con `#e`**
- [x] **Step 4: tests de dedupe, orden y paginacion**
  - Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts`
  - Expected: PASS

## Chunk 3: Estado UI Dedicado

### Task 5: Hook `useFollowingFeed`

**Files:**
- Create: `src/nostr-overlay/hooks/useFollowingFeed.ts`
- Create: `src/nostr-overlay/hooks/useFollowingFeed.test.ts`

- [x] **Step 1: estado dialog/feed/thread/composer**
- [x] **Step 2: acciones `openDialog`, `loadNextFeedPage`, `openThread`, `publishPost`, `publishReply`, `toggleReaction`, `toggleRepost`**
- [x] **Step 3: optimistic update + rollback en errores**
  - Run: `pnpm vitest run src/nostr-overlay/hooks/useFollowingFeed.test.ts`
  - Expected: PASS

## Chunk 4: UI e Integracion en App

### Task 6: Componentes del feature

**Files:**
- Create: `src/nostr-overlay/components/FollowingFeedIconButton.tsx`
- Create: `src/nostr-overlay/components/FollowingFeedDialog.tsx`
- Create: `src/nostr-overlay/components/FollowingFeedDialog.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [x] **Step 1: boton icono con badge unread opcional**
- [x] **Step 2: dialog con lista + infinite scroll + vista hilo + composer**
- [x] **Step 3: acciones por post (reply/react/repost)**
- [x] **Step 4: tests UI principales**
  - Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedDialog.test.tsx`
  - Expected: PASS

### Task 7: Wiring en `App.tsx`

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: integrar boton en toolbar expandida y compacta**
- [x] **Step 2: abrir/cerrar dialog y conectar con owner/follows/writeGateway**
- [x] **Step 3: tests de integracion en App**
  - Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "following feed"`
  - Expected: PASS

## Chunk 5: Verificacion Final

### Task 8: Regression y build

**Files:**
- Verify: `src/nostr/**`
- Verify: `src/nostr-overlay/**`

- [x] **Step 1: ejecutar suite del feature**
  - Run: `pnpm vitest run src/nostr/social-feed-service.test.ts src/nostr/social-feed-runtime-service.test.ts src/nostr-overlay/hooks/useFollowingFeed.test.ts src/nostr-overlay/components/FollowingFeedDialog.test.tsx && pnpm vitest run src/nostr-overlay/App.test.tsx -t "following feed"`
  - Expected: PASS
- [x] **Step 2: ejecutar typecheck**
  - Run: `pnpm typecheck`
  - Expected: sin errores nuevos introducidos por este feature
- [x] **Step 3: ejecutar build**
  - Run: `pnpm build`
  - Expected: PASS
