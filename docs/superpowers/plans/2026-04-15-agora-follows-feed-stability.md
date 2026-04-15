# Agora Following Feed Stability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que el feed de personas seguidas en Agora cargue de forma consistente (20 notas iniciales + paginacion), evitando cuelgues por relays y mostrando un estado vacio claro con `Empty` de shadcn cuando no hay seguidos.

**Architecture:** Mantener la arquitectura actual (TanStack `useInfiniteQuery` + `loadFollowingFeed`) y endurecerla con timeout explicito en lectura y fallback real de relays. Separar claramente "sin seguidos" de "sin publicaciones", sin cambiar el alcance del feed (solo follows).

**Tech Stack:** React 19, TypeScript, TanStack Query, NDK (`@nostr-dev-kit/ndk`), Vitest, shadcn/ui.

---

## Reglas de Ejecucion

- Sin worktrees: todo en el branch/directorio actual.
- Sin commits intermedios: ejecutar chunks completos y validar.
- Un unico commit al final, despues de la prueba manual.
- Mantener cambios acotados a los archivos definidos en cada chunk.

## Seguimiento de Tareas

- Durante la implementacion, actualizar este archivo en tiempo real.
- Cada paso completado debe pasar de `- [ ]` a `- [x]`.
- Si aparece trabajo nuevo, anadirlo en el chunk correspondiente antes de ejecutarlo.
- No cerrar un chunk sin dejar sus casillas y estado al dia.

---

## Chunk 1: Reproducir el fallo de "carga eterna" en tests

**Contexto:**
`ndk.fetchEvents` puede quedarse pendiente indefinidamente y el Agora quedarse en "Cargando feed". Antes de tocar logica, lo dejamos cubierto en tests para evitar regresiones.

### Task 1: Capturar el timeout en pruebas del runtime social

**Files:**
- Modify: `src/nostr/social-feed-runtime-service.test.ts`

- [x] **Step 1: Anadir test RED para timeout en feed de seguidos**
  - Primario se cuelga (`fetchBackfill` pendiente) y fallback responde.
  - Esperado: `loadFollowingFeed` termina con datos del fallback.

- [x] **Step 2: Anadir test RED para timeout total**
  - Primario y fallback fallan por timeout.
  - Esperado: devuelve error recuperable con mensaje de timeout.

- [x] **Step 3: Ejecutar tests del archivo**
  - Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts`
  - Expected: FAIL en tests nuevos (RED inicial).

---

## Chunk 2: Timeout explicito + fallback estable

**Contexto:**
`loadFollowingFeed` depende de `transport.fetchBackfill` sin deadline propio. Si una lectura no responde, el fallback no llega a activarse. Este chunk lo corrige sin cambiar el modelo funcional.

### Task 2: Endurecer lecturas del runtime social

**Files:**
- Modify: `src/nostr/social-feed-runtime-service.ts`
- Modify: `src/nostr/social-feed-runtime-service.test.ts`

- [x] **Step 1: Introducir timeout configurable en runtime social**
  - Anadir `backfillTimeoutMs?: number` a `CreateRuntimeSocialFeedServiceOptions`.
  - Anadir default (recomendado: `7_000`).

- [x] **Step 2: Crear helper de lectura con timeout**
  - Helper tipo `fetchBackfillWithTimeout(transport, filters, timeoutMs)` usando `Promise.race`.
  - Error con texto compatible (`timeout`) para fallback recuperable.

- [x] **Step 3: Usar el helper en todos los caminos de lectura**
  - `loadFollowingFeed`
  - `loadHashtagFeed`
  - `loadThread`
  - `loadEngagement`

- [x] **Step 4: Mantener estrategia actual de fallback**
  - `withRelayFallback` debe seguir saltando a fallback en errores recuperables.

- [x] **Step 5: Ejecutar tests**
  - Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts`
  - Expected: PASS.

---

## Chunk 3: Cobertura de relays para follows

**Contexto:**
El feed de perfil consume resolucion de relays mas rica (incluye hints), mientras el social feed usa set mas conservador. Esto puede causar falsos vacios en Agora aunque haya publicaciones de seguidos.

### Task 3: Enriquecer relays primarios del social feed

**Files:**
- Modify: `src/nostr/relay-runtime.ts`
- Modify: `src/nostr/relay-runtime.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/App.tsx`

- [x] **Step 1: Extender `relay-runtime` para aceptar relays extra de lectura**
  - Mantener modo conservador actual.
  - Permitir sumar `additionalReadRelays` al `primary` social, normalizado y sin duplicados.

- [x] **Step 2: Exponer `relayHints` en el contrato de overlay**
  - Retornar `relayHints` desde `useNostrOverlay`.

- [x] **Step 3: Consumir extras en `App.tsx` al crear `socialFeedService`**
  - `resolveRelays`: conservador por owner + `overlay.relayHints`.
  - `resolveFallbackRelays`: mantener fallback conservador actual.

- [x] **Step 4: Anadir/ajustar tests de resolucion**
  - Casos de merge correcto sin perder fallback.

- [x] **Step 5: Ejecutar tests**
  - Run: `pnpm vitest run src/nostr/relay-runtime.test.ts`
  - Expected: PASS.

---

## Chunk 4: Estado "No sigues a nadie todavia" con Empty de shadcn

**Contexto:**
Actualmente el estado por defecto confunde "no hay publicaciones" con "no sigues a nadie". Este chunk separa ambos escenarios usando el componente `Empty` ya integrado.

### Task 4: Diferenciar vacio por follows

**Files:**
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- (Optional) Modify: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Exponer `hasFollows` desde el controller**
  - Derivar de `follows.length > 0` y devolverlo en la API del hook.

- [x] **Step 2: Propagar `hasFollows` a la superficie de UI**
  - `App.tsx` -> `FollowingFeedSurface` -> `FollowingFeedContent`.

- [x] **Step 3: Render condicional con `Empty` de shadcn**
  - Mostrar "No sigues a nadie todavia" cuando:
    - no hay hilo activo,
    - no esta cargando,
    - no hay hashtag activo,
    - `hasFollows === false`,
    - `items.length === 0`.
  - Mantener "Sin publicaciones" cuando si hay seguidos pero no hay notas.

- [x] **Step 4: Actualizar tests de superficie**
  - Ajustar expectativas existentes y anadir caso especifico de no-follows.

- [x] **Step 5: Ejecutar tests**
  - Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Expected: PASS.

---

## Chunk 5: Verificacion integral + prueba manual + commit unico final

**Contexto:**
Se cierra con evidencia tecnica y validacion manual. Solo despues de validar en app se hace el commit unico final.

### Task 5: Cierre y entrega

**Files:**
- Verify: `src/nostr/social-feed-runtime-service.ts`
- Verify: `src/nostr/relay-runtime.ts`
- Verify: `src/nostr-overlay/**`

- [x] **Step 1: Ejecutar suite enfocada**
  - Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts src/nostr/relay-runtime.test.ts src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Expected: PASS.

- [x] **Step 2: Ejecutar typecheck**
  - Run: `pnpm typecheck`
  - Expected: PASS.

- [ ] **Step 3: Smoke manual antes de commit**
  - Cuenta con seguidos: carga inicial de 20 y paginacion al scroll/boton.
  - Relay lento/caido: no queda spinner eterno, hay fallback o error claro.
  - Cuenta sin seguidos: aparece `Empty` con "No sigues a nadie todavia".

- [ ] **Step 4: Commit unico final (solo tras validacion manual)**
  - Run:
    - `git add src/nostr/social-feed-runtime-service.ts src/nostr/social-feed-runtime-service.test.ts src/nostr/relay-runtime.ts src/nostr/relay-runtime.test.ts src/nostr-overlay/hooks/useFollowingFeedController.ts src/nostr-overlay/components/FollowingFeedSurface.tsx src/nostr-overlay/components/FollowingFeedContent.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/App.tsx src/nostr-overlay/hooks/useNostrOverlay.ts`
    - `git commit -m "fix(agora): stabilize follows feed loading and add no-follows empty state"`
