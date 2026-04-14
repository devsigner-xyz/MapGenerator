# Agora Engagement + Hashtag + Media Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el indicador de Agora para mostrar engagement remoto real (reacciones/reposts/comentarios), sats recibidos por zap, soporte de hashtags con busqueda en relays, soporte de imagenes/videos, y ajustes UX de tarjetas.

**Architecture:** Se introduce un modo de feed por hashtag sobre TanStack Query (cache key dedicada) sin romper el flujo actual de follows. El runtime de Nostr endurece agregacion de engagement remoto (incluyendo `#q` y parsing NIP-57 para sats) con deduplicacion y chunking para evitar undercount. La UI de Agora se refactoriza para render rico de contenido (hashtags/media), metadatos compactos y acciones pedidas.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Nostr NIP-01/NIP-10/NIP-18/NIP-25/NIP-57/NIP-92.

---

## File Structure (target)

- Modify: `src/nostr/types.ts`
  - ampliar `NostrFilter` para `#t` y `#q`.
- Modify: `src/nostr/social-feed-service.ts`
  - extender contratos de feed/engagement (`zapSats`, busqueda por hashtag).
- Modify: `src/nostr/social-feed-runtime-service.ts`
  - implementar `loadHashtagFeed` + agregacion robusta de engagement remoto/sats.
- Modify: `src/nostr/social-feed-runtime-service.test.ts`
  - cubrir hashtag feed, q-reposts, replies remotos y sats.
- Modify: `src/nostr-overlay/query/types.ts`
  - agregar input de hashtag para query keys.
- Modify: `src/nostr-overlay/query/keys.ts`
  - key deterministica para hashtag en Agora.
- Modify: `src/nostr-overlay/query/following-feed.query.ts`
  - modo query por follows vs hashtag (infinite query).
- Modify: `src/nostr-overlay/query/query-standards.test.ts`
  - validar contratos de keys/factory con hashtag.
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
  - wiring de hashtag filter + lifecycle limpio (thread/estado).
- Modify: `src/nostr-overlay/App.tsx`
  - sync ruta `?tag=...`, callbacks `onSelectHashtag`, `onClearHashtag`, `onCopyNoteId`.
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
  - hashtags clickable, media inline, labels/textos removidos, fecha/hora top-right, copy id.
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
  - prop drilling minimo para filtro hashtag/copy.
- Modify: `src/nostr-overlay/styles.css`
  - estilos de filtro activo, metadata header, media grid, hashtag chips, copy action.
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - pruebas UI del nuevo rendering y acciones.
- Modify: `src/nostr-overlay/App.test.tsx`
  - integracion de ruta/tag + uso de servicio hashtag + UX visible del filtro.

---

## Chunk 1: Protocol + Domain Contracts

### Task 1: Extender contratos de feed/engagement para hashtag y sats

**Files:**
- Modify: `src/nostr/types.ts`
- Modify: `src/nostr/social-feed-service.ts`
- Test: `src/nostr/social-feed-service.test.ts`

- [ ] **Step 1: Write failing tests for new contracts**
  - Agregar tests para nuevos campos de metricas (`zapSats`) y helpers de target id/tag handling esperados.

- [ ] **Step 2: Run tests to verify RED**
  Run: `pnpm vitest run src/nostr/social-feed-service.test.ts`
  Expected: FAIL por contrato nuevo no implementado.

- [ ] **Step 3: Implement minimal contract changes**
  - `NostrFilter`: agregar `'#t'?: string[]`, `'#q'?: string[]`.
  - `SocialEngagementMetrics`: agregar `zapSats: number`.
  - `SocialFeedService`: agregar `loadHashtagFeed(input)`.

- [ ] **Step 4: Re-run test to verify GREEN**
  Run: `pnpm vitest run src/nostr/social-feed-service.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat(nostr): extend feed contracts for hashtag mode and zap sats"`

---

## Chunk 2: Runtime Aggregation Hardening

### Task 2: Implementar busqueda por hashtag y engagement remoto robusto

**Files:**
- Modify: `src/nostr/social-feed-runtime-service.ts`
- Test: `src/nostr/social-feed-runtime-service.test.ts`

- [ ] **Step 1: Write failing runtime tests**
  - `loadHashtagFeed` pagina por `#t`.
  - engagement cuenta reposts remotos via `#q` (quote repost).
  - replies remotos no se pierden por markers `root/reply`.
  - zaps agregan `zaps` y `zapSats` parseando `description.amount` (msats->sats).
  - chunking/dedup evita undercount con multiples target events.

- [ ] **Step 2: Run tests to verify RED**
  Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts`
  Expected: FAIL en casos nuevos.

- [ ] **Step 3: Implement hashtag feed**
  - Nuevo `loadHashtagFeed({ hashtag, limit, until })`.
  - Query `kinds: [1,6,16]`, `#t: [tag]`, paginacion por `until`, dedupe/sort.

- [ ] **Step 4: Implement robust engagement aggregation**
  - fetch por chunks de ids.
  - incluir filtros `#e` y `#q` (para quotes).
  - reglas kind-aware:
    - `7` -> reactions.
    - `6|16` -> reposts (preferir `q`, fallback `e`).
    - `1` -> replies (markers root/reply con fallback seguro).
    - `9735` -> zaps + `zapSats`.
  - dedupe por `event.id`.

- [ ] **Step 5: Re-run tests to verify GREEN**
  Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  `git commit -m "fix(nostr): harden remote engagement and add hashtag feed runtime"`

---

## Chunk 3: TanStack Query Integration

### Task 3: Integrar modo hashtag en query keys y feed query hooks

**Files:**
- Modify: `src/nostr-overlay/query/types.ts`
- Modify: `src/nostr-overlay/query/keys.ts`
- Modify: `src/nostr-overlay/query/following-feed.query.ts`
- Test: `src/nostr-overlay/query/query-standards.test.ts`

- [ ] **Step 1: Write failing tests for deterministic hashtag keys**
  - key incluye hashtag normalizado (trim + sin `#` + lowercase).

- [ ] **Step 2: Run tests to verify RED**
  Run: `pnpm vitest run src/nostr-overlay/query/query-standards.test.ts`
  Expected: FAIL en nuevos asserts de keys/contracts.

- [ ] **Step 3: Implement key + query hook changes**
  - extender input de `followingFeed`.
  - `useFollowingFeedInfiniteQuery` usa:
    - `service.loadFollowingFeed` cuando no hay tag;
    - `service.loadHashtagFeed` cuando hay tag.
  - `enabled` correcto para ambos modos.

- [ ] **Step 4: Re-run tests to verify GREEN**
  Run: `pnpm vitest run src/nostr-overlay/query/query-standards.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat(query): add hashtag-aware agora query keys and loading mode"`

### Task 4: Controller + App routing de filtro hashtag

**Files:**
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing integration tests**
  - click en hashtag activa `/agora?tag=...`.
  - UI muestra filtro activo visible.
  - limpiar filtro vuelve a timeline normal.
  - con tag activo se llama carga por hashtag (no solo follows).

- [ ] **Step 2: Run tests to verify RED**
  Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "hashtag"`
  Expected: FAIL por wiring no implementado.

- [ ] **Step 3: Implement minimal route/controller wiring**
  - parse de `tag` desde `location.search`.
  - callbacks `onSelectHashtag` y `onClearHashtag`.
  - reset de thread cuando cambia hashtag para UX consistente.

- [ ] **Step 4: Re-run tests to verify GREEN**
  Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "hashtag"`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat(agora): wire hashtag filter route with controller state"`

---

## Chunk 4: Agora UI/UX Delivery

### Task 5: Render de contenido enriquecido + ajustes de tarjeta solicitados

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Test: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing component tests**
  - no aparece titulo "Nota".
  - no aparece "Nota original".
  - no aparece "Repost sin comentario" cuando repost vacio.
  - fecha/hora en top-right card header.
  - accion copiar junto al id.
  - hashtags clicables.
  - media image/video render desde contenido/imeta.

- [ ] **Step 2: Run tests to verify RED**
  Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  Expected: FAIL por markup/behavior viejo.

- [ ] **Step 3: Implement UI changes**
  - metadata header: author + id + copy + time derecha.
  - eliminar labels redundantes.
  - repost: mostrar comentario solo si existe.
  - renderer seguro de contenido:
    - segmentacion texto/hashtags/URLs,
    - `img`/`video` inline con `loading="lazy"` y `controls`.
  - indicador zap muestra sats (`metrics.zapSats`) con aria accesible.

- [ ] **Step 4: Add/adjust CSS for responsive UX**
  - chip de filtro activo.
  - layout top-right time.
  - media blocks y spacing movil.

- [ ] **Step 5: Re-run tests to verify GREEN**
  Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/App.test.tsx`
  Expected: PASS.

- [ ] **Step 6: Commit**
  `git commit -m "feat(agora-ui): add media/hashtag rendering and simplify note card metadata"`

---

## Chunk 5: Verification + Regression Gate

### Task 6: Verificacion integral tecnica y funcional

**Files:**
- Verify: `src/nostr/social-feed-runtime-service.ts`
- Verify: `src/nostr-overlay/**`
- Verify: tests touched above

- [ ] **Step 1: Run focused suite**
  Run: `pnpm vitest run src/nostr/social-feed-service.test.ts src/nostr/social-feed-runtime-service.test.ts src/nostr-overlay/query/query-standards.test.ts src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/App.test.tsx`
  Expected: PASS.

- [ ] **Step 2: Run full unit tests**
  Run: `pnpm test:unit`
  Expected: PASS.

- [ ] **Step 3: Run typecheck and build**
  Run: `pnpm typecheck && pnpm build`
  Expected: PASS.

- [ ] **Step 4: Final commit**
  `git commit -m "fix(agora): restore remote engagement, sats, hashtag relay search, and media support"`

---
