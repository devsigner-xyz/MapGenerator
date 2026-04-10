# Chat DM 1:1 Overlay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar mensajeria DM 1:1 real en el overlay con boton de chat, punto rojo de no leidos, modal lista/detalle y apertura directa desde `Enviar mensaje` del context menu.

**Architecture:** Se separa en cuatro capas: transporte Nostr DM (`publish/subscribe/backfill`), servicio de dominio (`DmService` para NIP-17/59/44), estado UI (`useDirectMessages`) y componentes React (boton + modal + lista + detalle). Se mantiene `write-gateway` como capa de firma/cifrado y se agrega una frontera explicita de transporte para no mezclar red con logica de negocio.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, NDK (`@nostr-dev-kit/ndk`), nostr-tools, estilos en `src/nostr-overlay/styles.css`.

---

## Skills y reglas de ejecucion

- [x] Aplicar `@test-driven-development` en cada tarea funcional (test rojo -> implementacion minima -> test verde).
- [x] Aplicar `@nostr-specialist` en construccion y validacion de flujo NIP-17/NIP-59/NIP-44.
- [x] Aplicar `@verification-before-completion` antes de cerrar cada chunk.

## Chunk 1: Transporte y contrato DM

### Task 1: Definir contratos y tipos de transporte DM

**Files:**
- Create: `src/nostr/dm-transport.ts`
- Create: `src/nostr/dm-types.ts`
- Test: `src/nostr/dm-transport.test.ts`

- [x] **Step 1: Write failing tests** para contrato minimo (`publishToRelays`, `subscribe`, `fetchBackfill`) y forma de `PublishResult`.
- [x] **Step 2: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr/dm-transport.test.ts`
  - Expected: FAIL por modulos/exports inexistentes.
- [x] **Step 3: Write minimal implementation** de interfaces/tipos sin logica de red.
- [x] **Step 4: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr/dm-transport.test.ts`
  - Expected: PASS.
- [ ] **Step 5: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr/dm-transport.ts src/nostr/dm-types.ts src/nostr/dm-transport.test.ts`
  - `git commit -m "feat: add dm transport contracts"`

### Task 2: Implementar adaptador NDK para publish/subscribe/backfill

**Files:**
- Create: `src/nostr/dm-transport-ndk.ts`
- Modify: `src/nostr/ndk-client.ts`
- Modify: `src/nostr/lazy-ndk-client.ts`
- Test: `src/nostr/dm-transport-ndk.test.ts`

- [x] **Step 1: Write failing tests** para orden de tiers (`inbox/write -> read -> session`) y dedupe de relays canonicos.
- [x] **Step 2: Write failing tests** para cap maximo de 6 relays y timeout de 4s por relay.
- [x] **Step 3: Write failing tests** para criterio de exito: ACK en tier 1/2 cuando existe; fallback a cualquier tier si no existe 1/2.
- [x] **Step 4: Write failing tests** para cleanup de subscription en unsubscribe.
- [x] **Step 5: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts`
  - Expected: FAIL en publish/subscribe no implementados.
- [x] **Step 6: Write minimal implementation** del algoritmo de tiers + dedupe + truncado + timeout.
- [x] **Step 7: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr/dm-transport-ndk.test.ts`
  - Expected: PASS.
- [ ] **Step 8: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr/dm-transport-ndk.ts src/nostr/ndk-client.ts src/nostr/lazy-ndk-client.ts src/nostr/dm-transport-ndk.test.ts`
  - `git commit -m "feat: add ndk dm transport adapter"`

## Chunk 2: Servicio de dominio DM (NIP-17)

### Task 3: Implementar `DmService` con validacion NIP y parseo de capas

**Files:**
- Create: `src/nostr/dm-service.ts`
- Create: `src/nostr/dm-service-crypto.ts`
- Test: `src/nostr/dm-service.test.ts`

- [x] **Step 1: Write failing test** para unwrap `1059 -> 13 -> 14`.
- [x] **Step 2: Write failing test** para validar firmas `kind 1059` y `kind 13`.
- [x] **Step 3: Write failing test** para `seal.pubkey == rumor.pubkey`.
- [x] **Step 4: Write failing test** para `kind 14` con exactamente un `p` tag.
- [x] **Step 5: Write failing test** para matriz direccional 1:1 (`incoming/outgoing`) y descarte de casos invalidos.
- [x] **Step 6: Write failing test** para orden por `rumor.created_at` y dedupe por `rumorEventId`.
- [x] **Step 7: Write failing test** para fallback de dedupe (`rumorEventId -> sealEventId -> contentHash`) y tie-break lexicografico por `rumorEventId`.
- [x] **Step 8: Write failing test** para idempotencia de reintentos (reusar `clientMessageId` + `rumorEventId` sin duplicar burbuja UI).
- [x] **Step 9: Write failing test** para descarte de `1059/13` con JSON roto o campos faltantes (sin mutar store).
- [x] **Step 10: Write failing test** para tags de envio:
  - rumor `kind 14` con exactamente un `p` del destinatario,
  - `gift wrap kind 1059` con `p` tag para routing.
- [x] **Step 11: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr/dm-service.test.ts`
  - Expected: FAIL por funciones ausentes.
- [x] **Step 12: Write minimal implementation** de parser/validator NIP y matriz direccional.
- [x] **Step 13: Write minimal implementation** de descarte seguro de payload invalido (`invalid` no muta store).
- [x] **Step 14: Write minimal implementation** de identidad canonica con fallback (`rumorEventId`, `sealEventId`, `contentHash`) y tie-break estable.
- [x] **Step 15: Write minimal implementation** de `sendDm`, `subscribeInbox`, `fetchConversationBackfill`.
- [x] **Step 16: Write minimal implementation** de builders de tags (`buildRumorTags`/`buildGiftWrapTags`) segun reglas NIP.
- [x] **Step 17: Write minimal implementation** de entrega (`maxAttempts=3`, delays `500ms/1500ms`, criterios ACK por tier) reusando IDs de mensaje en retries.
- [x] **Step 18: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr/dm-service.test.ts`
  - Expected: PASS.
- [ ] **Step 19: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr/dm-service.ts src/nostr/dm-service-crypto.ts src/nostr/dm-service.test.ts`
  - `git commit -m "feat: add dm service for nip17 flow"`

### Task 4: Integrar capacidades de sesion y `write-gateway` para DM NIP-44

**Files:**
- Modify: `src/nostr/write-gateway.ts`
- Modify: `src/nostr/auth/session.ts`
- Test: `src/nostr/write-gateway.test.ts`

- [x] **Step 1: Write failing tests** para gating con `isEncryptionEnabled(session, 'nip44')`.
- [x] **Step 2: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr/write-gateway.test.ts`
  - Expected: FAIL en nuevos casos de capacidad.
- [x] **Step 3: Write minimal implementation** para validar esquema `nip44` en send/decrypt DM.
- [x] **Step 4: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr/write-gateway.test.ts`
  - Expected: PASS.
- [ ] **Step 5: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr/write-gateway.ts src/nostr/auth/session.ts src/nostr/write-gateway.test.ts`
  - `git commit -m "fix: enforce nip44 capability for dm paths"`

## Chunk 3: Estado UI de conversaciones y no leidos

### Task 5: Implementar estrategia de backfill A/B/C y merge canonico

**Files:**
- Modify: `src/nostr/dm-service.ts`
- Modify: `src/nostr/dm-service.test.ts`

- [x] **Step 1: Write failing test** para ventana de backfill de inicio (`7d`).
- [x] **Step 2: Write failing test** para ventana de backfill de reconexion (`15m`).
- [x] **Step 3: Write failing test** para merge A/B/C (`inbox + salientes relay + sent-index local`).
- [x] **Step 4: Write failing test** para conservar solo salientes que pasan validacion direccional (`outgoing`).
- [x] **Step 5: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr/dm-service.test.ts`
  - Expected: FAIL en reglas de backfill/merge.
- [x] **Step 6: Write minimal implementation** de estrategia A/B/C y merge canonico.
- [x] **Step 7: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr/dm-service.test.ts`
  - Expected: PASS.
- [ ] **Step 8: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr/dm-service.ts src/nostr/dm-service.test.ts`
  - `git commit -m "feat: add dm backfill strategy and canonical merge"`

### Task 6: Crear `useDirectMessages` con persistencia y ownership de subscription

**Files:**
- Create: `src/nostr-overlay/hooks/useDirectMessages.ts`
- Create: `src/nostr-overlay/hooks/useDirectMessages.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [x] **Step 1: Write failing tests** para:
  - singleton de subscription por `ownerPubkey`,
  - `lastReadAt` en epoch seconds,
  - punto rojo global,
  - sent-index schema/GC (max 2000, 30 dias),
  - mensaje incoming no desencriptable cuenta como unread y se marca read al abrir detalle,
  - key format `nostr-overlay:dm:v1:seen:<ownerPubkey>:<conversationId>`,
  - aislamiento per-user en storage de vistos,
  - migracion best-effort `v1 -> v2`.
- [x] **Step 2: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr-overlay/hooks/useDirectMessages.test.ts`
  - Expected: FAIL por hook inexistente.
- [x] **Step 3: Write minimal implementation** del adapter versionado de read-state storage (schema + migracion + parse seguro).
- [x] **Step 4: Write minimal implementation** del store normalizado y acciones (`openList`, `openConversation`, `markConversationRead`, `sendMessage`).
- [x] **Step 5: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr-overlay/hooks/useDirectMessages.test.ts`
  - Expected: PASS.
- [ ] **Step 6: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr-overlay/hooks/useDirectMessages.ts src/nostr-overlay/hooks/useDirectMessages.test.ts src/nostr-overlay/hooks/useNostrOverlay.ts`
  - `git commit -m "feat: add dm state hook with unread persistence"`

## Chunk 4: UI de chat y wiring en App

### Task 7: Implementar componentes de chat (boton, modal, lista, detalle)

**Files:**
- Create: `src/nostr-overlay/components/ChatIconButton.tsx`
- Create: `src/nostr-overlay/components/ChatModal.tsx`
- Create: `src/nostr-overlay/components/ChatConversationList.tsx`
- Create: `src/nostr-overlay/components/ChatConversationDetail.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Test: `src/nostr-overlay/components/ChatModal.test.tsx`

- [x] **Step 1: Write failing tests** para render de punto rojo, navegacion lista/detalle y estado empty.
- [x] **Step 2: Write failing test** para placeholder de mensaje no desencriptable en detalle.
- [x] **Step 3: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr-overlay/components/ChatModal.test.tsx`
  - Expected: FAIL.
- [x] **Step 4: Write minimal implementation** de componentes y estilos responsive desktop/mobile.
- [x] **Step 5: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr-overlay/components/ChatModal.test.tsx`
  - Expected: PASS.
- [ ] **Step 6: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr-overlay/components/ChatIconButton.tsx src/nostr-overlay/components/ChatModal.tsx src/nostr-overlay/components/ChatConversationList.tsx src/nostr-overlay/components/ChatConversationDetail.tsx src/nostr-overlay/styles.css src/nostr-overlay/components/ChatModal.test.tsx`
  - `git commit -m "feat: add chat modal ui with conversation list and detail"`

### Task 8: Integrar chat en `App` y context menu

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Write failing tests** para:
  - boton chat junto a settings/refresh/stats,
  - boton chat en toolbar compacta,
  - apertura modal desde toolbar en vista lista (`activeConversationId = null`),
  - apertura detalle directo desde `Enviar mensaje`,
  - foco inicial en composer tras apertura directa desde context menu,
  - fallback `nostr:npub` cuando modulo DM no inicializa.
- [x] **Step 2: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
  - Expected: FAIL en nuevos escenarios.
- [x] **Step 3: Write minimal implementation** de wiring App + bridge/context menu.
- [x] **Step 4: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
  - Expected: PASS.
- [ ] **Step 5: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr-overlay/App.tsx src/nostr-overlay/App.test.tsx`
  - `git commit -m "feat: wire chat modal into overlay toolbar and context menu"`

## Chunk 5: Hardening, verificaciones y cierre

### Task 9: Cobertura de lifecycle (lock/logout/reconnect) y no duplicacion

**Files:**
- Modify: `src/nostr-overlay/hooks/useDirectMessages.test.ts`
- Modify: `src/nostr/dm-service.test.ts`
- Modify: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Write failing tests** para lock/logout durante chat, reconnect con backfill 15m y singleton de subscription.
- [x] **Step 2: Run test to verify it fails**
  - Run: `pnpm vitest run src/nostr-overlay/hooks/useDirectMessages.test.ts src/nostr/dm-service.test.ts src/nostr-overlay/App.test.tsx`
  - Expected: FAIL.
- [x] **Step 3: Write minimal implementation** de cleanup/resubscribe y manejo de composer disabled por estado de sesion.
- [x] **Step 4: Run test to verify it passes**
  - Run: `pnpm vitest run src/nostr-overlay/hooks/useDirectMessages.test.ts src/nostr/dm-service.test.ts src/nostr-overlay/App.test.tsx`
  - Expected: PASS.
- [ ] **Step 5: Commit** _(diferido por instruccion de sesion: commit unico al final del proyecto)_
  - `git add src/nostr-overlay/hooks/useDirectMessages.test.ts src/nostr/dm-service.test.ts src/nostr-overlay/App.test.tsx`
  - `git commit -m "test: cover dm lifecycle reconnect and session transitions"`

### Task 10: Verificacion final de rama

**Files:**
- Test: `src/nostr/**/*.test.ts`
- Test: `src/nostr-overlay/**/*.test.ts`
- Test: `src/nostr-overlay/**/*.test.tsx`

- [x] Run: `pnpm vitest run src/nostr src/nostr-overlay` _(equivalente; el filtro con globs quoted no encontro archivos en Vitest)_
- [x] Expected: PASS en tests de Nostr y overlay tocados por DM.
- [x] Run: `pnpm typecheck`
- [x] Expected: sin errores TypeScript.
- [x] Run: `pnpm build`
- [x] Expected: build exitoso.
- [ ] (Opcional) Run: `pnpm test:smoke`
- [ ] Expected: smoke E2E en verde si entorno local disponible.

## Riesgos y mitigaciones

- [ ] **Riesgo:** diferencias de comportamiento por relay. **Mitigacion:** criterios de ACK por tiers + fallback definido.
- [ ] **Riesgo:** duplicados de mensaje por retries. **Mitigacion:** `clientMessageId` + reuse de `rumorEventId`.
- [ ] **Riesgo:** desalineacion de timestamps ms/seconds. **Mitigacion:** normalizacion estricta a epoch seconds en storage y comparaciones.
- [ ] **Riesgo:** sesion sin `nip44` en NIP-07/NIP-46. **Mitigacion:** gating explicito y UX de bloqueo de envio.

## Criterios de aceptacion

- [ ] Boton de chat visible en toolbar normal y compacta junto a acciones actuales.
- [ ] Punto rojo global visible solo cuando existan no leidos.
- [ ] Modal muestra listado y detalle con navegacion usable en desktop/mobile.
- [ ] `Enviar mensaje` en context menu abre directo el detalle del pubkey objetivo.
- [ ] Envio/recepcion DM 1:1 real funciona en tiempo real con sesion compatible NIP-44.
- [ ] Sin compatibilidad de cifrado adecuada, envio queda deshabilitado con feedback claro.
