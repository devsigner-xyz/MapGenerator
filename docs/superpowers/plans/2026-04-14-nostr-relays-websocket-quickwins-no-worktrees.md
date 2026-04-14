# Nostr Relays WebSocket Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar estabilidad de relays y conexiones WebSocket (Agora, notificaciones, DM) con quick wins de bajo riesgo y alto impacto, reduciendo fallos transitorios y perdida de mensajes.

**Architecture:** Se mantiene la arquitectura actual y se endurece por capas: (1) seleccion correcta de relays segun tipo de trafico, (2) retries/backfill para reconexion, (3) menor latencia de publicacion y menor fanout de conexiones, (4) reintento de DMs fallidos con outbox persistente. Cambios incrementales, testeados y con commits pequenos.

**Tech Stack:** React 19, TypeScript, @nostr-dev-kit/ndk, TanStack Query, Vitest, pnpm.

---

## Execution Constraint (Mandatory)

- [ ] **No usar worktrees durante la ejecucion de este plan**

Regla explicita: toda la implementacion se hace en el workspace actual, sin crear ni usar `git worktree` en ningun paso.

---

## Chunk 1: Baseline + Relay Selection Correcta

### Task 1: Baseline reproducible de estabilidad

**Files:**
- Modify: `src/nostr/relay-runtime.test.ts`
- Modify: `src/nostr/social-feed-runtime-service.test.ts`
- Modify: `src/nostr/social-notifications-runtime-service.test.ts`

- [ ] **Step 1: Add failing test for social relay selection by read path**
Validar que el set primario de lectura social privilegia `nip65Read + nip65Both`, no `nip65Write`.

- [ ] **Step 2: Run focused tests to confirm RED**
Run: `pnpm vitest run src/nostr/relay-runtime.test.ts src/nostr/social-feed-runtime-service.test.ts src/nostr/social-notifications-runtime-service.test.ts`
Expected: FAIL en los tests nuevos.

- [ ] **Step 3: Capture baseline manual metrics**
Medir: errores WebSocket/minuto y tiempo de primera carga de Agora en 5 minutos de uso.

- [ ] **Step 4: Commit baseline tests**
```bash
git add src/nostr/relay-runtime.test.ts src/nostr/social-feed-runtime-service.test.ts src/nostr/social-notifications-runtime-service.test.ts
git commit -m "test: codify relay-read selection baseline for social flows"
```

### Task 2: Corregir seleccion de relays para consumo social

**Files:**
- Modify: `src/nostr/relay-runtime.ts`
- Modify: `src/nostr/relay-runtime.test.ts`

- [ ] **Step 1: Write minimal implementation**
Cambiar resolucion primaria social para lectura efectiva (`nip65Read + nip65Both`) y fallback a `state.relays`/bootstrap solo cuando corresponda.

- [ ] **Step 2: Run focused tests to confirm GREEN**
Run: `pnpm vitest run src/nostr/relay-runtime.test.ts src/nostr/social-feed-runtime-service.test.ts src/nostr/social-notifications-runtime-service.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit relay-selection fix**
```bash
git add src/nostr/relay-runtime.ts src/nostr/relay-runtime.test.ts
git commit -m "fix: prioritize read-capable relays for social consumption"
```

---

## Chunk 2: Backfill Resilience + Reconnect Window

### Task 3: Retry en `fetchBackfill` con errores recuperables

**Files:**
- Modify: `src/nostr/dm-transport-ndk.ts`
- Modify: `src/nostr/dm-transport-ndk.test.ts`

- [ ] **Step 1: Add failing tests for backfill retry behavior**
Casos: timeout/network/websocket reintenta; error no recuperable no reintenta.

- [ ] **Step 2: Run test to confirm RED**
Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts`
Expected: FAIL en asserts nuevos.

- [ ] **Step 3: Implement retry wrapper in backfill**
Aplicar `withRetry(...)` tambien en `fetchBackfill` respetando clasificacion actual de recoverable errors.

- [ ] **Step 4: Run test to confirm GREEN**
Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/nostr/dm-transport-ndk.ts src/nostr/dm-transport-ndk.test.ts
git commit -m "fix: add recoverable retry policy to dm backfill"
```

### Task 4: Usar modo reconnect en backfill de conversaciones

**Files:**
- Modify: `src/nostr/dm-runtime-service.ts`
- Modify: `src/nostr-overlay/query/direct-messages.query.ts`
- Modify: `src/nostr/dm-runtime-service.test.ts`
- Modify: `src/nostr-overlay/query/direct-messages.query.test.tsx`

- [ ] **Step 1: Add failing tests for reconnect mode propagation**
Verificar que al reconectar se usa `mode: 'reconnect'` (ventana corta), no siempre `session_start`.

- [ ] **Step 2: Run tests to confirm RED**
Run: `pnpm vitest run src/nostr/dm-runtime-service.test.ts src/nostr-overlay/query/direct-messages.query.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement reconnect path**
Agregar wiring para invocar loaders con modo reconnect cuando aplica (re-suscripcion/reapertura tras corte).

- [ ] **Step 4: Run tests to confirm GREEN**
Run: `pnpm vitest run src/nostr/dm-runtime-service.test.ts src/nostr-overlay/query/direct-messages.query.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/nostr/dm-runtime-service.ts src/nostr-overlay/query/direct-messages.query.ts src/nostr/dm-runtime-service.test.ts src/nostr-overlay/query/direct-messages.query.test.tsx
git commit -m "fix: use reconnect backfill window for dm recovery"
```

---

## Chunk 3: Publish Performance + Connection Fanout

### Task 5: Publicacion paralela con concurrencia acotada

**Files:**
- Modify: `src/nostr/dm-transport-ndk.ts`
- Modify: `src/nostr/dm-transport-ndk.test.ts`

- [ ] **Step 1: Add failing tests for bounded parallel publish**
Validar que la publicacion mantiene agregado correcto de resultados y respeta limite de concurrencia.

- [ ] **Step 2: Run tests to confirm RED**
Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement worker-based bounded concurrency (2-3)**
Reemplazar loop secuencial relay-a-relay por cola con workers limitados.

- [ ] **Step 4: Run tests to confirm GREEN**
Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/nostr/dm-transport-ndk.ts src/nostr/dm-transport-ndk.test.ts
git commit -m "perf: publish dm events with bounded relay concurrency"
```

### Task 6: Limitar fanout de relays activos por sesion

**Files:**
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Add failing test for relay cap behavior**
Validar que `runtimeDmRelays` y `runtimeDmOutboxRelays` quedan capados de forma determinista.

- [ ] **Step 2: Run tests to confirm RED**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement relay caps**
Aplicar tope razonable (ej. 8 inbox / 8 outbox) tras normalizar y deduplicar.

- [ ] **Step 4: Run tests to confirm GREEN**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/nostr-overlay/hooks/useNostrOverlay.ts src/nostr-overlay/App.test.tsx
git commit -m "fix: cap runtime dm relay fanout to reduce websocket churn"
```

---

## Chunk 4: Outbox Retry + Final Verification

### Task 7: Reintento de DMs fallidos desde outbox persistente

**Files:**
- Modify: `src/nostr-overlay/query/direct-messages.query.ts`
- Modify: `src/nostr-overlay/query/dm-storage.ts`
- Modify: `src/nostr-overlay/query/direct-messages.query.test.tsx`

- [ ] **Step 1: Add failing test for failed-to-retry flow**
Caso esperado: mensaje `failed` se persiste y se reintenta al recuperar conectividad.

- [ ] **Step 2: Run tests to confirm RED**
Run: `pnpm vitest run src/nostr-overlay/query/direct-messages.query.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement minimal outbox retry**
Persistir metadatos minimos y ejecutar reintentos acotados por interval/reconnect.

- [ ] **Step 4: Run tests to confirm GREEN**
Run: `pnpm vitest run src/nostr-overlay/query/direct-messages.query.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/nostr-overlay/query/direct-messages.query.ts src/nostr-overlay/query/dm-storage.ts src/nostr-overlay/query/direct-messages.query.test.tsx
git commit -m "fix: retry failed dm deliveries from persistent outbox"
```

### Task 8: Verificacion final

**Files:**
- Verify: `src/nostr/**`
- Verify: `src/nostr-overlay/**`

- [ ] **Step 1: Run full quality gate**
Run: `pnpm typecheck && pnpm test:unit`
Expected: PASS.

- [ ] **Step 2: Manual smoke test (5-10 min)**
Validar:
- Agora carga estable en primer intento.
- Menor ruido de desconexion websocket.
- DM recupera envio tras corte corto.

- [ ] **Step 3: Compare against baseline**
Comparar errores/minuto y tiempo de primera carga respecto a Task 1.

- [ ] **Step 4: Final commit**
```bash
git add -A
git commit -m "fix: stabilize nostr relay/websocket behavior with quick wins"
```

---

## Definition Of Done

- Seleccion de relays coherente por tipo de trafico (lectura vs escritura).
- Backfill robusto ante errores transitorios con reconnect window efectiva.
- Publicacion DM con menor latencia por concurrencia acotada.
- Menor churn de conexiones por fanout limitado de relays.
- DMs fallidos con reintento automatico basico.
- `pnpm typecheck` y `pnpm test:unit` en verde.
- Implementacion completada **sin usar worktrees**.
