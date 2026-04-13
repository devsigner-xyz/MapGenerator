# TanStack Query Coherencia Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar la coherencia de server-state en el overlay migrando los flujos remotos restantes a TanStack Query, manteniendo APIs de UI estables y sin reintroducir rutas legacy.

**Architecture:** Consolidar toda lectura/escritura remota en `src/nostr-overlay/query/*` con keys estables (`nostrOverlayQueryKeys`) y control de invalidaciones explícitas. Mantener en hooks/componentes solo estado local/UI (open/close, input, toggles). Evitar sincronización manual con contadores de versión o estados de carrera ad-hoc.

**Tech Stack:** React 19, TanStack Query v5, TypeScript, Vitest, Vite.

---

## Contexto Base (ya implementado)

- Migración social previa terminada en `docs/superpowers/plans/2026-04-12-tanstack-query-social-migration-sin-legacy.md` (Chunks 1-6).
- Base Query ya disponible en:
  - `src/nostr-overlay/query/query-client.ts`
  - `src/nostr-overlay/query/keys.ts`
  - `src/nostr-overlay/query/types.ts`
- Controllers Query activos en:
  - `src/nostr-overlay/hooks/useFollowingFeedController.ts`
  - `src/nostr-overlay/query/social-notifications.query.ts`
  - `src/nostr-overlay/query/direct-messages.query.ts`
- Guard anti-legacy activo en `src/nostr-overlay/no-legacy-guards.test.ts`.

---

## Chunk 1: Global User Search en Query

### Task 1: Reemplazar búsqueda imperativa por query cacheada por término

**Files:**
- Create: `src/nostr-overlay/query/user-search.query.ts`
- Modify: `src/nostr-overlay/components/GlobalUserSearchDialog.tsx`
- Modify: `src/nostr-overlay/query/keys.ts`
- Test: `src/nostr-overlay/components/GlobalUserSearchDialog.test.tsx`

- [x] **Step 1: Add failing tests for query path and race-safety**
Agregar tests para asegurar:
1) cache por término (`term A` no pisa `term B`),
2) rendering de loading/error/data desde query state,
3) eliminación de lógica manual de control de carrera en componente.

- [x] **Step 2: Run targeted tests to confirm failure**
Run: `pnpm vitest run src/nostr-overlay/components/GlobalUserSearchDialog.test.tsx -t "query|cache|race"`
Expected: FAIL.

- [x] **Step 3: Implement query hook for user search**
En `user-search.query.ts` implementar un hook que:
1) reciba `term`, `enabled`, `onSearch`,
2) use `useQuery` con `queryKey` estable,
3) haga trim/normalización de término,
4) devuelva estado serializado para UI.

Estructura mínima esperada:
```ts
export function useUserSearchQuery(input: {
  term: string;
  enabled: boolean;
  onSearch: (query: string) => Promise<{ pubkeys: string[]; profiles: Record<string, NostrProfile> }>;
}) { /* ... */ }
```

- [x] **Step 4: Extend query keys with search namespace**
Agregar key factory en `keys.ts`:
```ts
userSearch: (input: { term: string }) => ['nostr-overlay', 'social', 'search', { term: normalizedTerm }] as const
```

- [x] **Step 5: Wire GlobalUserSearchDialog to query hook**
Reemplazar estado imperativo (`requestIdRef`, `isSearching`, `error`, `result` manual) por estado derivado de query.
Mantener debounce de input si ya aporta UX, pero el fetch y cache deben residir en Query.

- [x] **Step 6: Re-run tests**
Run: `pnpm vitest run src/nostr-overlay/components/GlobalUserSearchDialog.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**
`git commit -m "refactor: migrate global user search to tanstack query cache"`

---

## Chunk 2: NIP-05 Verification en Query

### Task 2: Migrar verificación concurrente manual a `useQueries`

**Files:**
- Create: `src/nostr-overlay/query/nip05.query.ts`
- Modify: `src/nostr-overlay/hooks/useNip05Verification.ts`
- Test: `src/nostr-overlay/hooks/useNip05Verification.test.ts`

- [x] **Step 1: Add failing tests for per-pubkey cache semantics**
- [x] **Step 2: Run targeted tests to confirm failure**
- [x] **Step 3: Implement `useQueries` helper for NIP-05**
- [x] **Step 4: Keep external API contract of `useNip05Verification` stable**
- [x] **Step 5: Re-run tests**
- [ ] **Step 6: Commit**

---

## Chunk 3: Agora unread real por `lastReadAt`

### Task 3: Reemplazar heurística de unread en feed por read-state persistente

**Files:**
- Create: `src/nostr-overlay/query/following-feed-read-state.ts`
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Add failing tests for `lastReadAt` unread behavior**
- [x] **Step 2: Run targeted tests to confirm failure**
- [x] **Step 3: Implement feed read-state storage + selectors**
- [x] **Step 4: Expose `hasUnread` from controller and consume in App**
- [x] **Step 5: Re-run tests**
- [ ] **Step 6: Commit**

---

## Chunk 4: Relay NIP-11 metadata con Query

### Task 4: Reemplazar estado manual `relayInfoByUrl`

**Files:**
- Create: `src/nostr-overlay/query/relay-metadata.query.ts`
- Modify: `src/nostr-overlay/components/MapSettingsPage.tsx`
- Test: `src/nostr-overlay/components/MapSettingsDialog.test.tsx`

- [x] **Step 1: Add failing tests for relay metadata cache/retry behavior**
- [x] **Step 2: Run targeted tests to confirm failure**
- [x] **Step 3: Implement relay metadata query hook**
- [x] **Step 4: Wire settings page to query state**
- [x] **Step 5: Re-run tests**
- [ ] **Step 6: Commit**

---

## Chunk 5: Active Profile data fuera de `useNostrOverlay`

### Task 5: Mover posts/stats/network de perfil activo a capa Query

**Files:**
- Create: `src/nostr-overlay/query/active-profile.query.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Add failing tests for active profile data from query**
- [x] **Step 2: Run targeted tests to confirm failure**
- [x] **Step 3: Implement active profile queries (posts, stats, network)**
- [x] **Step 4: Simplify `useNostrOverlay` to orchestration/auth/map concerns**
- [x] **Step 5: Re-run tests**
- [ ] **Step 6: Commit**

---

## Chunk 6: Estandarización final de keys e invalidaciones

### Task 6: Endurecer coherencia de Query layer

**Files:**
- Modify: `src/nostr-overlay/query/keys.ts`
- Modify: `src/nostr-overlay/query/query-client.ts`
- Create: `src/nostr-overlay/query/query-standards.test.ts`

- [x] **Step 1: Add tests for key normalization and deterministic key shape**
- [x] **Step 2: Define/adjust invalidation strategy by domain**
- [x] **Step 3: Tune query defaults by data profile (`staleTime`, `gcTime`, retries)**
- [x] **Step 4: Re-run tests**
- [ ] **Step 5: Commit**

---

## Validación Global de Fase 2

- [x] `pnpm typecheck`
- [x] `pnpm test:unit`
- [x] `pnpm build`
- [x] `rg "useFollowingFeed\(|useSocialNotifications\(|useDirectMessages\(|chatStateVersion|FollowingFeedDialog" src/nostr-overlay` (expected: no matches)

---

## Exit Criteria

- Todo server-state del overlay social que siga activo en UI está gestionado por TanStack Query.
- No se reintroducen rutas de sincronización manual o stores imperativos legacy.
- Keys e invalidaciones son consistentes entre feed, notifications, DM, búsqueda, NIP-05 y relays.
- Typecheck, tests y build en verde.
