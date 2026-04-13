# Sidebar Pages Consistency Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar chats de modal a ruta/pagina y eliminar naming heredado `Dialog` en las vistas del sidebar.

**Architecture:** La ruta controla la visibilidad de vistas del sidebar (`/chats`, `/agora`, `/notificaciones`, etc.). Los componentes navegables del sidebar usan naming `*Page`. `Dialog` queda solo para modales reales.

**Tech Stack:** React 19, react-router 7, TypeScript, Vitest, CSS en `src/nostr-overlay/styles.css`.

---

## Chunk 1: Chats por ruta

### Task 1: Reemplazar modal de chats por `/chats`

**Files:**
- Rename: `src/nostr-overlay/components/ChatDialog.tsx` -> `src/nostr-overlay/components/ChatsPage.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/OverlaySidebar.tsx`
- Rename: `src/nostr-overlay/components/ChatDialog.test.tsx` -> `src/nostr-overlay/components/ChatsPage.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Actualizar tests para esperar navegacion/ruta (`/chats`) en lugar de dialog.
- [ ] Crear `ChatsPage` sin `DialogContent`, manteniendo layout/contenido actual.
- [ ] Conectar sidebar/context-menu/search a `navigate('/chats')` con query params (`peer`, `compose`) cuando aplique.
- [ ] Agregar ruta `/chats` en `App.tsx` y eliminar source-of-truth de visibilidad basado en `chatOpen`.
- [ ] Ejecutar tests de chats y app.

## Chunk 2: Naming `*Page` para vistas del sidebar

### Task 2: Renombrar componentes heredados

**Files:**
- Rename/merge: `src/nostr-overlay/components/NotificationsDialog.tsx` -> `src/nostr-overlay/components/NotificationsPage.tsx`
- Rename/merge: `src/nostr-overlay/components/GlobalUserSearchDialog.tsx` -> `src/nostr-overlay/components/UserSearchPage.tsx`
- Rename/merge: `src/nostr-overlay/components/CityStatsDialog.tsx` -> `src/nostr-overlay/components/CityStatsPage.tsx`
- Rename/merge: `src/nostr-overlay/components/EasterEggMissionsDialog.tsx` -> `src/nostr-overlay/components/DiscoverPage.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Rename tests: `NotificationsDialog.test.tsx`, `GlobalUserSearchDialog.test.tsx`, `MapSettingsDialog.test.tsx`

- [ ] Eliminar wrappers `*Page` que solo reenviaban `variant="surface"`.
- [ ] Mantener `onClose` en pages para volver a mapa.
- [ ] Actualizar imports/suites a naming `*Page`.
- [ ] Ejecutar tests de componentes renombrados.

## Chunk 3: Controladores sin naming `Dialog`

### Task 3: Renombrar estado y handlers

**Files:**
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Modify: `src/nostr-overlay/query/social-notifications.query.ts`
- Modify: `src/nostr-overlay/App.tsx`

- [ ] Renombrar `isDialogOpen/openDialog/closeDialog` a naming neutral (`isOpen/open/close`).
- [ ] Renombrar `openSettingsDialog` a `openSettingsPage`.
- [ ] Ejecutar `pnpm typecheck`.

## Chunk 4: CSS consistente con naming page

### Task 4: Renombrar clases heredadas de dialog para páginas del sidebar

**Files:**
- Modify: `src/nostr-overlay/styles.css`
- Modify: componentes `*Page` del sidebar

- [ ] Renombrar selectores `nostr-*-dialog` cuando representen pages del sidebar.
- [ ] Ajustar media queries y referencias en tests.

## Chunk 5: Regresion completa

### Task 5: Validacion final

**Files:**
- Modify as needed: `src/nostr-overlay/App.test.tsx`
- Verify: `src/nostr-overlay/no-legacy-guards.test.ts`

- [ ] Ejecutar suite de overlay.
- [ ] Ejecutar `pnpm test`.
- [ ] Confirmar flujo completo desktop/mobile para rutas del sidebar.
