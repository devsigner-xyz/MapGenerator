# Buscador Global De Usuarios Overlay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un buscador global de usuarios accesible siempre (con o sin sesion), con icono en toolbar y dialog con input shadcn + icono de busqueda + debounce.

**Architecture:** Implementar una capa de busqueda global en dominio Nostr (npub/hex exact match + NIP-50 kind 0), exponerla desde `useNostrOverlay`, y construir un dialog UI reutilizando componentes existentes del overlay para abrir perfiles y respetar capacidades de interaccion.

**Tech Stack:** React 19, TypeScript, Vitest, NDK client actual, shadcn/ui (`Dialog`, `Input`, `Button`).

---

## Execution Constraints (obligatorio)

- [x] **Sin worktrees:** ejecutar en `/home/pablo/projects/MapGenerator`.
- [ ] **Unico commit al final:** no realizar commits intermedios.

## File Structure

**Create**
- `src/nostr/user-search.ts`
- `src/nostr/user-search.test.ts`
- `src/nostr-overlay/components/GlobalUserSearchDialog.tsx`
- `src/nostr-overlay/components/GlobalUserSearchDialog.test.tsx`

**Modify**
- `src/nostr/types.ts`
- `src/nostr-overlay/hooks/useNostrOverlay.ts`
- `src/nostr-overlay/App.tsx`
- `src/nostr-overlay/App.test.tsx`
- `src/nostr-overlay/styles.css`

## Chunk 1: Dominio De Busqueda Global + Wiring Overlay

### Task 1: Extender tipos para NIP-50

**Files:**
- Modify: `src/nostr/types.ts`

- [x] **Step 1: Agregar `search?: string` a `NostrFilter`**
- [x] **Step 2: Mantener compatibilidad con filtros actuales (`authors`, `kinds`, `#p`, etc.)**

### Task 2: Crear servicio de busqueda global en dominio Nostr

**Files:**
- Create: `src/nostr/user-search.ts`
- Create: `src/nostr/user-search.test.ts`

- [x] **Step 1: Red test - retorna resultado por `npub` exacto**
- [x] **Step 2: Red test - combina resultados exactos + NIP-50 sin duplicados**
- [x] **Step 3: Red test - tolera errores de relay y retorna fallback seguro**
- [x] **Step 4: Implementar minimo para verde**
  - API sugerida:
  - `searchUsers({ query, client, relays, limit }): Promise<{ pubkeys: string[]; profiles: Record<string, NostrProfile>; }>`
  - exact match: `npub` y hex pubkey
  - NIP-50: `kinds: [0], search: query`
  - dedupe por pubkey y elegir metadata mas reciente
- [x] **Step 5: Ejecutar tests del servicio**
  - Run: `pnpm test:unit -- src/nostr/user-search.test.ts`
  - Expected: PASS

### Task 3: Exponer busqueda desde `useNostrOverlay`

**Files:**
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [x] **Step 1: Agregar inyeccion opcional `searchUsersFn` a `NostrOverlayServices`**
- [x] **Step 2: Resolver relays con settings del usuario + bootstrap (sin indices externos)**
- [x] **Step 3: Exponer `searchUsers` en el retorno del hook**

## Chunk 2: UI De Busqueda Global (Dialog + Toolbar + Debounce)

### Task 4: Crear `GlobalUserSearchDialog` con input shadcn

**Files:**
- Create: `src/nostr-overlay/components/GlobalUserSearchDialog.tsx`
- Create: `src/nostr-overlay/components/GlobalUserSearchDialog.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [x] **Step 1: Red test - aplica debounce antes de llamar `onSearch`**
- [x] **Step 2: Red test - renderiza loading/empty/results correctamente**
- [x] **Step 3: Red test - click en resultado llama `onSelectUser(pubkey)`**
- [x] **Step 4: Implementar minimo para verde**
  - Dialog shadcn siguiendo estilo overlay
  - fila superior con `SearchIcon` + `Input`
  - debounce (300ms)
  - acciones de fila: ver detalles (siempre), mensaje solo si capability habilitada
- [x] **Step 5: Ejecutar tests del dialog**
  - Run: `pnpm test:unit -- src/nostr-overlay/components/GlobalUserSearchDialog.test.tsx`
  - Expected: PASS

### Task 5: Integrar boton de buscar y dialog en `App.tsx`

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Agregar estado `globalSearchOpen` y handlers**
- [x] **Step 2: Agregar icon button en toolbar expandida**
- [x] **Step 3: Agregar icon button equivalente en toolbar compacta**
- [x] **Step 4: Wire del dialog con `overlay.searchUsers` y `overlay.openActiveProfile`**
- [x] **Step 5: Actualizar tests de App para ambos toolbars y apertura dialog**

## Chunk 3: Ajustes Finales + Verificacion

### Task 6: Verificacion integral

**Files:**
- Modify: `docs/superpowers/plans/2026-04-11-buscador-global-usuarios-overlay.md`

- [ ] **Step 1: Ejecutar suite puntual de tests del feature**
  - Run: `pnpm test:unit -- src/nostr/user-search.test.ts src/nostr-overlay/components/GlobalUserSearchDialog.test.tsx`
  - Expected: PASS
- [ ] **Step 2: Ejecutar regression basica App overlay**
  - Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx`
  - Expected: PASS
- [ ] **Step 3: Ejecutar typecheck**
  - Run: `pnpm typecheck`
  - Expected: sin errores nuevos causados por este feature
