# Nostr WebSocket And Agora Stability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabilizar la conectividad Nostr para que Agora cargue de forma consistente, reduciendo desconexiones frecuentes y ruido de `WebSocket failed` con una estrategia de relays conservadora (relays del usuario primero, bootstrap solo como fallback).

**Architecture:** Se centraliza la resolucion de relays con scope por `ownerPubkey`, se reutiliza transporte NDK por conjunto de relays para evitar churn de conexiones, y se introduce fallback conservador hacia bootstrap relays solo ante vacio o fallo real del set principal. El probe de salud de relays se desacopla del flujo productivo para no contaminar estado ni consola.

**Tech Stack:** React 19, TypeScript, @nostr-dev-kit/ndk, TanStack Query, Vitest, pnpm.

---

## Chunk 1: Scope Correcto De Relays + Baseline

### Task 1: Congelar baseline y reproducibilidad de fallos

**Files:**
- Modify: `src/nostr-overlay/hooks/useRelayConnectionSummary.test.ts`
- Modify: `src/nostr/social-feed-runtime-service.test.ts`

- [ ] **Step 1: Write failing test for transport churn**
Agregar test que evidencie que `loadFollowingFeed`, `loadThread` y `loadEngagement` no deberian crear transporte nuevo en cada llamada (actualmente lo hacen).

- [ ] **Step 2: Write failing test for noisy probe behavior**
Agregar test que detecte exceso de probes simultaneos/periodicos en `useRelayConnectionSummary`.

- [ ] **Step 3: Run tests to verify RED**
Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts src/nostr-overlay/hooks/useRelayConnectionSummary.test.ts`
Expected: FAIL en nuevos tests.

- [ ] **Step 4: Capture manual baseline metrics**
Medir en entorno local: errores `WebSocket ... failed` por minuto y tiempo de primera carga de Agora.

### Task 2: Resolver relays sociales con scope por owner

**Files:**
- Create: `src/nostr/relay-runtime.ts`
- Modify: `src/nostr/social-feed-runtime-service.ts`
- Modify: `src/nostr/social-notifications-runtime-service.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Test: `src/nostr/social-feed-runtime-service.test.ts`
- Test: `src/nostr/social-notifications-runtime-service.test.ts`

- [ ] **Step 1: Write failing tests for user-scoped relay resolution**
Casos esperados:
- owner A y owner B resuelven relay sets distintos cuando su configuracion difiere.
- feed/notificaciones usan el set scoped del owner activo.

- [ ] **Step 2: Run tests to verify RED**
Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts src/nostr/social-notifications-runtime-service.test.ts`
Expected: FAIL en nuevos tests de scope.

- [ ] **Step 3: Implement centralized relay resolver**
Crear `relay-runtime.ts` con funciones puras para:
- normalizar/ordenar relays,
- resolver relays sociales por owner,
- exponer `relaySetKey` estable.

- [ ] **Step 4: Wire resolver from overlay app**
Inyectar resolver en la creacion de servicios runtime desde `App.tsx` para evitar uso global no scoped.

- [ ] **Step 5: Run tests to verify GREEN**
Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts src/nostr/social-notifications-runtime-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
`git commit -m "fix: scope social relay resolution by active owner"`

## Chunk 2: Reuso De Transporte + Fallback Conservador

### Task 3: Introducir pool de transporte NDK por relaySet

**Files:**
- Create: `src/nostr/transport-pool.ts`
- Modify: `src/nostr/social-feed-runtime-service.ts`
- Modify: `src/nostr/social-notifications-runtime-service.ts`
- Test: `src/nostr/social-feed-runtime-service.test.ts`
- Test: `src/nostr/social-notifications-runtime-service.test.ts`

- [ ] **Step 1: Write failing tests for transport reuse**
Casos esperados:
- varias llamadas de feed reutilizan misma instancia de transporte para mismo `relaySetKey`.
- `loadInitialSocial` y `subscribeSocial` reutilizan transporte compartido.

- [ ] **Step 2: Run tests to verify RED**
Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts src/nostr/social-notifications-runtime-service.test.ts`
Expected: FAIL en nuevos asserts de reuso.

- [ ] **Step 3: Implement minimal transport pool**
Implementar mapa en memoria keyed por `relaySetKey` con `getOrCreate`.
No agregar complejidad extra (sin LRU/disposal avanzada en esta fase).

- [ ] **Step 4: Integrate pool into runtime services**
Reemplazar `resolveTransport()` per-call por `getTransportForCurrentRelaySet()`.

- [ ] **Step 5: Run tests to verify GREEN**
Run: `pnpm vitest run src/nostr/social-feed-runtime-service.test.ts src/nostr/social-notifications-runtime-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
`git commit -m "perf: reuse ndk transport across social operations"`

### Task 4: Aplicar politica conservadora de bootstrap fallback

**Files:**
- Modify: `src/nostr/ndk-client.ts`
- Modify: `src/nostr/dm-transport-ndk.ts`
- Modify: `src/nostr/relay-policy.ts` (si hace falta helper)
- Test: `src/nostr/dm-transport-ndk.test.ts`
- Test: `src/nostr/ndk-client.test.ts`

- [ ] **Step 1: Write failing tests for fallback policy**
Reglas esperadas:
- si hay relays de usuario validos, no mezclar bootstrap incondicionalmente,
- si no hay relays validos o hay fallo de carga del set principal, usar bootstrap fallback.

- [ ] **Step 2: Run tests to verify RED**
Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts src/nostr/ndk-client.test.ts`
Expected: FAIL en nuevos tests de politica.

- [ ] **Step 3: Implement policy**
Aplicar modo conservador:
- primary = relays scoped del usuario,
- fallback = bootstrap relays solo bajo condicion de vacio/fallo.

- [ ] **Step 4: Verify no regression on overlay graph loader**
Comprobar coherencia con el fallback ya existente en `useNostrOverlay.ts`.

- [ ] **Step 5: Run tests to verify GREEN**
Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts src/nostr/ndk-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
`git commit -m "fix: apply conservative bootstrap fallback for relay failures"`

## Chunk 3: Resiliencia WS + Reduccion De Ruido

### Task 5: Backoff/retry/cooldown para errores de red

**Files:**
- Modify: `src/nostr/dm-transport-ndk.ts`
- Modify: `src/nostr-overlay/query/options.ts`
- Modify: `src/nostr-overlay/query/query-client.ts`
- Test: `src/nostr/dm-transport-ndk.test.ts`
- Test: `src/nostr-overlay/query/options.test.ts`

- [ ] **Step 1: Write failing tests for retry classification**
Casos:
- retry con backoff en timeout/network,
- no retry en errores no recuperables.

- [ ] **Step 2: Run tests to verify RED**
Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts src/nostr-overlay/query/options.test.ts`
Expected: FAIL en nuevos tests.

- [ ] **Step 3: Implement bounded retry with jitter**
Introducir backoff exponencial acotado y cooldown corto por relay tras fallos consecutivos.

- [ ] **Step 4: Tune connect/publish timeout defaults**
Ajustar timeouts para evitar fail-fast excesivo sin bloquear UX.

- [ ] **Step 5: Run tests to verify GREEN**
Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts src/nostr-overlay/query/options.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
`git commit -m "fix: harden relay retry and timeout strategy"`

### Task 6: Desacoplar probe de salud del flujo productivo

**Files:**
- Modify: `src/nostr-overlay/hooks/useRelayConnectionSummary.ts`
- Modify: `src/nostr-overlay/components/ProfileTab.tsx`
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts`
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelayDetailController.ts`
- Test: `src/nostr-overlay/hooks/useRelayConnectionSummary.test.ts`

- [ ] **Step 1: Write failing tests for probe throttling and scope**
Casos:
- probe solo activo en contexto de diagnostico/settings,
- concurrencia de probes limitada,
- intervalo no agresivo por defecto.

- [ ] **Step 2: Run tests to verify RED**
Run: `pnpm vitest run src/nostr-overlay/hooks/useRelayConnectionSummary.test.ts`
Expected: FAIL en nuevos tests.

- [ ] **Step 3: Implement passive-first probe strategy**
Priorizar estado del transporte para UI y dejar probes activos como diagnostico controlado.

- [ ] **Step 4: Run tests to verify GREEN**
Run: `pnpm vitest run src/nostr-overlay/hooks/useRelayConnectionSummary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
`git commit -m "chore: reduce websocket probe noise and relay flapping"`

## Chunk 4: Integracion, Verificacion Y Cierre

### Task 7: Verificacion funcional de Agora + notificaciones + DM

**Files:**
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/query/social-notifications.query.ts` (solo si requiere ajuste de lifecycle)
- Verify: `src/nostr/**`
- Verify: `src/nostr-overlay/**`

- [ ] **Step 1: Write failing integration tests for Agora resilience**
Esperado: Agora no queda bloqueado vacio ante fallos parciales de relays y termina cargando items.

- [ ] **Step 2: Run tests to verify RED**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: FAIL en nuevos escenarios.

- [ ] **Step 3: Implement minimal integration adjustments**
Ajustar wiring final entre servicios/query hooks segun necesidad detectada por tests.

- [ ] **Step 4: Run focused GREEN suite**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx src/nostr/social-feed-runtime-service.test.ts src/nostr/social-notifications-runtime-service.test.ts src/nostr/dm-transport-ndk.test.ts`
Expected: PASS.

### Task 8: Verificacion final y criterios de aceptacion

**Files:**
- Verify: `package.json` scripts

- [ ] **Step 1: Run typecheck and full unit tests**
Run: `pnpm typecheck && pnpm test:unit`
Expected: PASS.

- [ ] **Step 2: Manual smoke in app**
Validar en navegador durante 5-10 minutos:
- Agora carga primera pagina consistentemente,
- paginacion sigue funcional,
- menos `WebSocket ... failed` por minuto,
- relays muestran menos flapping.

- [ ] **Step 3: Compare against baseline**
Confirmar mejora contra metrica inicial (errores/minuto y tiempo de primera carga).

- [ ] **Step 4: Final commit**
`git commit -m "fix: stabilize nostr websocket connectivity and agora loading"`

---

## Definition Of Done

- Agora carga de forma consistente aun con relays parcialmente caidos.
- Feed/notificaciones dejan de recrear transporte por cada operacion.
- Relay resolution usa scope por owner y fallback bootstrap conservador.
- Probe de relays deja de generar ruido excesivo en consola.
- Suite de tests relevante en verde y sin regresiones en notificaciones/DM.

## Notes

- Decision de producto confirmada: **modo conservador** (primary relays del usuario, bootstrap solo como fallback por vacio/fallo).
- Mantener cambios incrementales y commits pequenos por task para facilitar rollback parcial si hiciera falta.
