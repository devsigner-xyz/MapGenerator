# DM Modal Historical Sync + Kind4 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar conversaciones DM existentes al abrir el modal (sin esperar eventos nuevos), con soporte de lectura para NIP-59 (`kind:1059`) y legado NIP-04 (`kind:4`).

**Architecture:** El fix tiene tres ejes: (1) conectar un `DirectMessagesService` real en runtime (hoy cae en no-op), (2) cargar historial inicial de conversaciones al arrancar el store DM, y (3) ampliar `dm-service` para ingestar y normalizar mensajes de `kind:1059` y `kind:4` en una sola vista de conversaciones. El envio se mantiene en flujo actual (NIP-59), pero la lectura debe ser dual para compatibilidad retroactiva.

**Tech Stack:** TypeScript, React hooks, NDK transport (`DmTransport`), Vitest, pnpm.

---

## File Structure and Responsibilities

- `src/nostr/dm-runtime-service.ts` (nuevo): factory de runtime para construir `DirectMessagesService` real desde `DmService` + transport lazy + write gateway.
- `src/nostr-overlay/hooks/useNostrOverlay.ts` (mod): wiring para usar servicio DM real por defecto y conservar override de tests.
- `src/nostr-overlay/hooks/useDirectMessages.ts` (mod): bootstrap inicial de historial + suscripcion live singleton por owner.
- `src/nostr/dm-service.ts` (mod): parse/backfill/merge multi-conversation para `kind:1059` y `kind:4`.
- `src/nostr/write-gateway.ts` (mod, si aplica): decrypt scheme-aware (`nip44`/`nip04`) consistente con tipo de evento.
- `src/nostr-overlay/App.test.tsx` (mod): cobertura de flujo UI sin inyeccion manual de DM service.
- `src/nostr-overlay/hooks/useDirectMessages.test.ts` (mod): cobertura de bootstrap inicial + singleton.
- `src/nostr/dm-service.test.ts` (mod): cobertura de backfill global y compatibilidad `kind:4`.
- `src/nostr/write-gateway.test.ts` (mod, si aplica): casos de decrypt por esquema.

---

## Chunk 1: Runtime Wiring (No More No-Op in Production)

### Task 1: Add failing runtime wiring tests

**Files:**
- Modify: `src/nostr-overlay/App.test.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test('loads DM modal data without explicit directMessagesService injection', async () => {
  // Mount App with default bootstrap-style services (no DM mock override)
  // Assert modal can render non-empty conversations once overlay is ready
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "loads DM modal data without explicit directMessagesService injection"`
Expected: FAIL because runtime path still resolves to NOOP DM service.

- [ ] **Step 3: Write minimal implementation**

```ts
// In useNostrOverlay.ts
const directMessagesService =
  services?.directMessagesService ?? createRuntimeDirectMessagesService(...)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "loads DM modal data without explicit directMessagesService injection"`
Expected: PASS.

- [ ] **Step 5: Commit**

Deferred by repo/session rule: single final commit only.

### Task 2: Implement runtime DM factory

**Files:**
- Create: `src/nostr/dm-runtime-service.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Optional Modify: `src/nostr-overlay/bootstrap.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write the failing test for factory behavior**

```ts
test('runtime DM factory wires subscribe/send against dm-service', async () => {
  // Validate adapter calls dmService.subscribeInbox/sendDm and maps results
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "runtime DM factory wires subscribe/send against dm-service"`
Expected: FAIL because factory module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// dm-runtime-service.ts
export function createRuntimeDirectMessagesService(deps): DirectMessagesService {
  // createLazyNdkDmTransport -> createDmService -> expose subscribeInbox/sendDm
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: PASS on updated runtime wiring tests.

- [ ] **Step 5: Commit**

Deferred by repo/session rule: single final commit only.

---

## Chunk 2: Initial Historical Bootstrap in DM Store

### Task 3: Add failing tests for initial conversation hydration

**Files:**
- Modify: `src/nostr-overlay/hooks/useDirectMessages.test.ts`
- Test: `src/nostr-overlay/hooks/useDirectMessages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('start hydrates conversations from initial backfill before live inbox events', async () => {
  // dmService.loadInitialConversations returns existing messages
  // store.start() should expose populated conversations immediately
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/nostr-overlay/hooks/useDirectMessages.test.ts -t "start hydrates conversations from initial backfill before live inbox events"`
Expected: FAIL because DirectMessagesService has no bootstrap method in store flow.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface DirectMessagesService {
  subscribeInbox(...)
  sendDm?(...)
  loadInitialConversations?(input: { ownerPubkey: string }): Promise<DirectMessageItem[]>
}

// store.start(): await loadInitialConversations -> ingest -> then subscribe
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/nostr-overlay/hooks/useDirectMessages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Deferred by repo/session rule: single final commit only.

### Task 4: Preserve dedupe/unread semantics after bootstrap

**Files:**
- Modify: `src/nostr-overlay/hooks/useDirectMessages.ts`
- Modify: `src/nostr-overlay/hooks/useDirectMessages.test.ts`
- Test: `src/nostr-overlay/hooks/useDirectMessages.test.ts`

- [ ] **Step 1: Write failing regression tests**

```ts
test('does not duplicate messages when bootstrap and live stream contain same id', ...)
test('computes unread correctly after bootstrap ingest', ...)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/nostr-overlay/hooks/useDirectMessages.test.ts -t "bootstrap"`
Expected: FAIL on dedupe/unread assertions.

- [ ] **Step 3: Write minimal implementation**

```ts
// reuse existing ingestMessage path for both bootstrap/live
// ensure compare + message id dedupe remains single source of truth
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/nostr-overlay/hooks/useDirectMessages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Deferred by repo/session rule: single final commit only.

---

## Chunk 3: Global Backfill for NIP-59 Conversations

### Task 5: Add failing tests for global multi-conversation backfill

**Files:**
- Modify: `src/nostr/dm-service.test.ts`
- Test: `src/nostr/dm-service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test('fetches historical messages across all peers from kind 1059 inbox + outgoing', ...)
test('derives conversationId from event payload for each peer', ...)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/nostr/dm-service.test.ts -t "across all peers"`
Expected: FAIL because only peer-targeted backfill exists.

- [ ] **Step 3: Write minimal implementation**

```ts
// dm-service.ts
async function fetchGlobalBackfill(input): Promise<DmMessage[]> {
  // filters for owner inbox/outgoing (kind 1059), parse, merge, dedupe, sort
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/nostr/dm-service.test.ts`
Expected: PASS including new global backfill tests.

- [ ] **Step 5: Commit**

Deferred by repo/session rule: single final commit only.

---

## Chunk 4: Legacy Kind4 (NIP-04) Read Compatibility

### Task 6: Add failing tests for kind4 parse/decrypt/merge

**Files:**
- Modify: `src/nostr/dm-service.test.ts`
- Optional Modify: `src/nostr/write-gateway.test.ts`
- Test: `src/nostr/dm-service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test('parses incoming/outgoing legacy kind4 messages into DmMessage shape', ...)
test('uses nip04 decrypt path for kind4 events', ...)
test('keeps undecryptable legacy messages as placeholder entries', ...)
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm vitest run src/nostr/dm-service.test.ts -t "kind4"`
Expected: FAIL because current parse path is 1059-only.

- [ ] **Step 3: Write minimal implementation**

```ts
// dm-service.ts
if (event.kind === 4) {
  // resolve peer from p-tag/pubkey
  // decrypt with scheme 'nip04'
  // normalize to DirectMessageItem/DmMessage
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/nostr/dm-service.test.ts src/nostr/write-gateway.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Deferred by repo/session rule: single final commit only.

---

## Chunk 5: Integration Verification

### Task 7: Overlay regression tests for pre-existing conversations

**Files:**
- Modify: `src/nostr-overlay/App.test.tsx`
- Optional Modify: `src/nostr-overlay/components/ChatModal.test.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write the failing integration test**

```ts
test('opens chat modal and shows existing conversations without waiting for new incoming events', ...)
```

- [ ] **Step 2: Run test to verify fail**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "shows existing conversations"`
Expected: FAIL before full integration.

- [ ] **Step 3: Write minimal implementation**

```ts
// wire UI to hydrated directMessages state from bootstrap + live stream
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

Deferred by repo/session rule: single final commit only.

### Task 8: Full verification before completion

**Files:**
- Modify: `docs/superpowers/plans/2026-04-10-dm-modal-historical-sync-kind4.md` (checkbox updates)

- [ ] **Step 1: Run focused DM suite**

Run: `pnpm vitest run src/nostr/dm-service.test.ts src/nostr/write-gateway.test.ts src/nostr-overlay/hooks/useDirectMessages.test.ts src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run domain suite**

Run: `pnpm vitest run src/nostr src/nostr-overlay`
Expected: PASS.

- [ ] **Step 3: Run static checks**

Run: `pnpm typecheck`
Expected: no TypeScript errors.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: successful build.

- [ ] **Step 5: Final single commit (only when explicitly requested)**

```bash
git add src/nostr/dm-runtime-service.ts src/nostr/dm-service.ts src/nostr/write-gateway.ts src/nostr-overlay/hooks/useNostrOverlay.ts src/nostr-overlay/hooks/useDirectMessages.ts src/nostr/dm-service.test.ts src/nostr/write-gateway.test.ts src/nostr-overlay/hooks/useDirectMessages.test.ts src/nostr-overlay/App.test.tsx docs/superpowers/plans/2026-04-10-dm-modal-historical-sync-kind4.md
git commit -m "fix: load historical DMs in modal and add legacy kind4 compatibility"
```

Expected: commit created only after explicit user request.

---

## Manual QA Checklist

- [ ] Login con cuenta que ya tenga DMs historicos (sin enviar mensaje nuevo).
- [ ] Abrir modal de chat y confirmar que hay conversaciones visibles inmediatamente.
- [ ] Abrir una conversacion historica `kind:1059` y validar contenido/orden.
- [ ] Abrir una conversacion historica `kind:4` y validar que aparece (contenido desencriptado o placeholder undecryptable, pero sin desaparecer el hilo).
- [ ] Enviar nuevo DM y confirmar que mergea en la misma conversacion sin duplicados.
