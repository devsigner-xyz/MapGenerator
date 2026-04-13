# Query Hardening Cierre Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el hardening posterior a la migracion social a TanStack Query con invalidacion granular real, pruebas unitarias directas de hooks nuevos y limpieza de cache por sesion.

**Architecture:** Mantener la arquitectura actual de controllers + query hooks y reforzar consistencia operacional. Primero se corrige alcance de invalidaciones para evitar refetches innecesarios, luego se agrega cobertura unitaria directa para contratos de query, y finalmente se asegura aislamiento de datos entre sesiones limpiando cache por scopes definidos.

**Tech Stack:** React, TypeScript, TanStack Query v5, Vitest, Vite.

---

## Chunk 1: Invalidacion granular por dominio

### Task 1: Reemplazar invalidaciones amplias por `nostrOverlayQueryKeys.invalidation.*`

**Files:**
- Modify: `src/nostr-overlay/query/following-feed.mutations.ts`
- Modify: `src/nostr-overlay/query/social-notifications.query.ts`
- Modify: `src/nostr-overlay/query/direct-messages.query.ts`
- Modify (si aplica): `src/nostr-overlay/App.tsx`
- Test: `src/nostr-overlay/query/query-standards.test.ts`
- Test (ajustes puntuales si rompen): `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Test (ajustes puntuales si rompen): `src/nostr-overlay/components/ChatDialog.test.tsx`
- Test (ajustes puntuales si rompen): `src/nostr-overlay/components/NotificationsDialog.test.tsx`

- [x] **Step 1: Add failing tests for invalidation scope behavior**
Agregar/ajustar tests para demostrar fallo cuando una accion invalida `social()` completo en lugar del scope esperado.

- [x] **Step 2: Run targeted tests to confirm failure**
Run: `pnpm vitest run src/nostr-overlay/query/query-standards.test.ts -t "invalidation"`
Expected: FAIL por scope demasiado amplio.

- [x] **Step 3: Implement granular invalidation usage**
Actualizar llamadas a `invalidateQueries`/`removeQueries` para usar:
- feed: `nostrOverlayQueryKeys.invalidation.followingFeed()`
- notifications: `nostrOverlayQueryKeys.invalidation.notifications()`
- dm: `nostrOverlayQueryKeys.invalidation.directMessages()`
- search/nip05/relay/active-profile solo cuando corresponda

- [x] **Step 4: Run targeted domain suites**
Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/ChatDialog.test.tsx src/nostr-overlay/components/NotificationsDialog.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add src/nostr-overlay/query/following-feed.mutations.ts src/nostr-overlay/query/social-notifications.query.ts src/nostr-overlay/query/direct-messages.query.ts src/nostr-overlay/App.tsx src/nostr-overlay/query/query-standards.test.ts src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/ChatDialog.test.tsx src/nostr-overlay/components/NotificationsDialog.test.tsx
git commit -m "refactor(query): apply granular invalidation scopes"
```

## Chunk 2: Cobertura unitaria directa de hooks/utilidades Query

### Task 2: Añadir pruebas unitarias para contratos de hooks nuevos

**Files:**
- Create: `src/nostr-overlay/query/active-profile.query.test.ts`
- Create: `src/nostr-overlay/query/relay-metadata.query.test.ts`
- Create: `src/nostr-overlay/query/following-feed-read-state.test.ts`
- Modify (si hace falta testability): `src/nostr-overlay/query/active-profile.query.ts`
- Modify (si hace falta testability): `src/nostr-overlay/query/relay-metadata.query.ts`
- Modify (si hace falta testability): `src/nostr-overlay/query/following-feed-read-state.ts`

- [x] **Step 1: Write failing tests for active profile query contract**
Cubrir: cache hit al reabrir pubkey, paginacion, dedupe por `post.id`, fallback de counts cuando stats falla.

- [x] **Step 2: Write failing tests for relay metadata query contract**
Cubrir: loading/error/ready, retry recuperable, key deterministica por relay URL.

- [x] **Step 3: Write failing tests for following feed read-state storage contract**
Cubrir: parse seguro, key versionada, normalizacion ms/sec.

- [x] **Step 4: Run tests to verify red state**
Run: `pnpm vitest run src/nostr-overlay/query/active-profile.query.test.ts src/nostr-overlay/query/relay-metadata.query.test.ts src/nostr-overlay/query/following-feed-read-state.test.ts`
Expected: FAIL inicial por casos aun no soportados/asegurados.

- [x] **Step 5: Implement minimal fixes until green**
Hacer los cambios minimos necesarios en los modulos query para pasar cobertura nueva sin ensanchar alcance funcional.

- [x] **Step 6: Re-run tests**
Run: `pnpm vitest run src/nostr-overlay/query/active-profile.query.test.ts src/nostr-overlay/query/relay-metadata.query.test.ts src/nostr-overlay/query/following-feed-read-state.test.ts`
Expected: PASS.

- [x] **Step 7: Commit**
```bash
git add src/nostr-overlay/query/active-profile.query.test.ts src/nostr-overlay/query/relay-metadata.query.test.ts src/nostr-overlay/query/following-feed-read-state.test.ts src/nostr-overlay/query/active-profile.query.ts src/nostr-overlay/query/relay-metadata.query.ts src/nostr-overlay/query/following-feed-read-state.ts
git commit -m "test(query): add unit coverage for active profile relay metadata and read-state"
```

## Chunk 3: Higiene de cache por sesion

### Task 3: Limpiar server-state social en logout/cambio de cuenta

**Files:**
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify (si hace falta helper): `src/nostr-overlay/query/keys.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Add failing session cache isolation tests**
Agregar tests para flujo login A -> logout -> login B verificando que no se reutilicen datos sociales del usuario A.

- [x] **Step 2: Run targeted tests to confirm failure**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "logout|session|cache|active profile|agora|dm|notifications"`
Expected: FAIL inicial en aislamiento de cache.

- [x] **Step 3: Implement scoped cache cleanup on session boundaries**
Al logout/cambio de owner ejecutar limpieza via QueryClient por scopes de `nostrOverlayQueryKeys.invalidation.*` (cancel + remove según aplique).

- [x] **Step 4: Re-run targeted tests**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "logout|session|cache|active profile|agora|dm|notifications"`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add src/nostr-overlay/hooks/useNostrOverlay.ts src/nostr-overlay/App.test.tsx src/nostr-overlay/query/keys.ts
git commit -m "fix(query): clear social cache on logout and account switch"
```

## Chunk 4: Validacion final y documentacion

### Task 4: Validar todo el stack y actualizar checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-04-13-query-hardening-cierre-fase-2.md`

- [x] **Step 1: Run typecheck**
Run: `pnpm typecheck`
Expected: PASS.

- [x] **Step 2: Run unit tests**
Run: `pnpm test:unit`
Expected: PASS.

- [x] **Step 3: Run production build**
Run: `pnpm build`
Expected: PASS (warnings no bloqueantes permitidos si no son regresion).

- [x] **Step 4: Mark plan checkboxes and summarize evidence**
Actualizar este plan con estado final de steps y registrar comandos ejecutados/resultados.

- [x] **Step 5: Commit**
```bash
git add docs/superpowers/plans/2026-04-13-query-hardening-cierre-fase-2.md
git commit -m "docs(plan): record query hardening execution evidence"
```

## Execution Evidence

### Chunk 1

- `pnpm vitest run src/nostr-overlay/query/query-standards.test.ts -t "invalidation"` -> FAIL inicial por invalidacion amplia `social()`.
- `pnpm vitest run src/nostr-overlay/query/query-standards.test.ts -t "invalidation"` -> PASS tras migrar a `invalidation.followingFeed()`.
- `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/ChatDialog.test.tsx src/nostr-overlay/components/NotificationsDialog.test.tsx` -> PASS (18 tests).
- Commit: `refactor(query): apply granular invalidation scopes`.

### Chunk 2

- `pnpm vitest run src/nostr-overlay/query/active-profile.query.test.ts src/nostr-overlay/query/relay-metadata.query.test.ts src/nostr-overlay/query/following-feed-read-state.test.ts` -> FAIL inicial (5 fallos).
- `pnpm vitest run src/nostr-overlay/query/active-profile.query.test.ts src/nostr-overlay/query/relay-metadata.query.test.ts src/nostr-overlay/query/following-feed-read-state.test.ts` -> PASS final (9 tests).
- Commit: `test(query): add unit coverage for active profile relay metadata and read-state`.

### Chunk 3

- `pnpm vitest run src/nostr-overlay/App.test.tsx -t "logout|session|cache|active profile|agora|dm|notifications"` -> FAIL inicial en flujo de aislamiento de cache por sesion.
- `pnpm vitest run src/nostr-overlay/App.test.tsx -t "logout|session|cache|active profile|agora|dm|notifications"` -> PASS tras limpieza por scopes en logout/cambio de owner.
- Commit: `fix(query): clear social cache on logout and account switch`.

### Chunk 4

- `pnpm typecheck` -> PASS.
- `pnpm test:unit` -> PASS (83 files, 488 tests).
- `pnpm build` -> PASS (warnings no bloqueantes de bundle/eval en dependencias).
