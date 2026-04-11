# DM Reliability And Capability Gating Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar el flujo de mensajeria directa para que recupere historial real, no pierda salientes al reabrir, y ocultar mensajeria cuando la sesion no pueda firmar+cifrar con NIP-44.

**Architecture:** Se refuerza la capa DM runtime/service (subscribe + backfill + rehidratacion de sent index) y se centraliza un gate de capacidad DM en auth/session para que toda la UI use el mismo criterio funcional. El chat deja de depender de fallback visual ambiguo y pasa a mostrar estado de entrega real por mensaje.

**Tech Stack:** React, TypeScript, Vitest, Nostr NIP-17/NIP-59 (+ compat kind 4), runtime DM service propio.

---

## Chunk 1: Capability Gate + UI Entry Points

### Task 1: Definir gate unico de capacidad DM (write + unlocked + nip44)

**Files:**
- Modify: `src/nostr/auth/session.ts`
- Test: `src/nostr/auth/session.test.ts`

- [ ] **Step 1: Write failing test for DM capability helper**
Add tests for helper `isDirectMessagesEnabled(session)` with these cases:
- true only when session is writable and has `nip44`
- false for readonly session
- false for locked session
- false when only `nip04`

- [ ] **Step 2: Run test to verify RED**
Run: `pnpm vitest src/nostr/auth/session.test.ts`
Expected: FAIL because helper does not exist yet.

- [ ] **Step 3: Implement minimal helper**
Implement `isDirectMessagesEnabled` in `session.ts` reusing `isWriteEnabled` and `hasEncryptionScheme(session, 'nip44')`.

- [ ] **Step 4: Run test to verify GREEN**
Run: `pnpm vitest src/nostr/auth/session.test.ts`
Expected: PASS.

### Task 2: Ocultar acceso a mensajes en sesiones no aptas

**Files:**
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/SocialSidebar.tsx`
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`
- Modify: `src/nostr-overlay/components/PersonContextMenuItems.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing UI tests**
Add tests that verify:
- chat button is hidden when session is readonly/locked/no-nip44
- "Enviar mensaje" context-menu action is hidden under same conditions

- [ ] **Step 2: Run test to verify RED**
Run: `pnpm vitest src/nostr-overlay/App.test.tsx --runInBand`
Expected: FAIL in new assertions.

- [ ] **Step 3: Implement UI gating**
- Expose `canDirectMessages` from `useNostrOverlay`
- Render `ChatIconButton` only when `canDirectMessages`
- Pass message action only when `canDirectMessages`
- Ensure open handlers short-circuit if capability becomes false

- [ ] **Step 4: Run tests to verify GREEN**
Run: `pnpm vitest src/nostr-overlay/App.test.tsx --runInBand`
Expected: PASS.

## Chunk 2: Runtime Receive Path + Conversation Backfill

### Task 3: Corregir subscribe runtime para no filtrar peer equivocado

**Files:**
- Modify: `src/nostr/dm-service.ts`
- Modify: `src/nostr/dm-runtime-service.ts`
- Test: `src/nostr/dm-service.test.ts`
- Test: `src/nostr/dm-runtime-service.test.ts` (new)

- [ ] **Step 1: Write failing tests**
Cover:
- subscribe inbox should accept incoming from any peer
- live subscription includes `kinds: [1059, 4]`

- [ ] **Step 2: Run RED**
Run: `pnpm vitest src/nostr/dm-service.test.ts src/nostr/dm-runtime-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement runtime/service fix**
- Remove owner-as-peer constraint in runtime subscribe path
- Parse live events through owner-based parser for both kinds

- [ ] **Step 4: Run GREEN**
Run: `pnpm vitest src/nostr/dm-service.test.ts src/nostr/dm-runtime-service.test.ts`
Expected: PASS.

### Task 4: Backfill por conversacion al abrir chat

**Files:**
- Modify: `src/nostr-overlay/hooks/useDirectMessages.ts`
- Modify: `src/nostr/dm-runtime-service.ts`
- Modify: `src/nostr/dm-service.ts`
- Test: `src/nostr-overlay/hooks/useDirectMessages.test.ts`

- [ ] **Step 1: Write failing tests**
Cover:
- opening conversation triggers conversation backfill once
- merges without duplicates

- [ ] **Step 2: Run RED**
Run: `pnpm vitest src/nostr-overlay/hooks/useDirectMessages.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimal API + store integration**
- Add optional `loadConversationMessages` method in DM service contract
- Call it from `openConversation` with owner + peer + sentIndex

- [ ] **Step 4: Run GREEN**
Run: `pnpm vitest src/nostr-overlay/hooks/useDirectMessages.test.ts`
Expected: PASS.

## Chunk 3: Sent Index Rehydration + Delivery UX

### Task 5: Rehidratar sent index en bootstrap global

**Files:**
- Modify: `src/nostr/dm-runtime-service.ts`
- Modify: `src/nostr-overlay/hooks/useDirectMessages.ts`
- Test: `src/nostr/dm-runtime-service.test.ts`

- [ ] **Step 1: Write failing test**
Ensure runtime loadInitialConversations forwards sent index from storage and merged data returns local sent entries.

- [ ] **Step 2: Run RED**
Run: `pnpm vitest src/nostr/dm-runtime-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement fix**
Inject/read sent index into runtime initial loader and pass to dmService fetchGlobalBackfill.

- [ ] **Step 4: Run GREEN**
Run: `pnpm vitest src/nostr/dm-runtime-service.test.ts`
Expected: PASS.

### Task 6: Mostrar estado de entrega en detalle de chat

**Files:**
- Modify: `src/nostr-overlay/components/ChatConversationDetail.tsx`
- Modify: `src/nostr-overlay/components/ChatModal.tsx` (only if type plumbing required)
- Test: `src/nostr-overlay/components/ChatModal.test.tsx`

- [ ] **Step 1: Write failing tests**
Add assertions for visible labels on outgoing messages: `Enviando...`, `Enviado`, `Error de entrega`.

- [ ] **Step 2: Run RED**
Run: `pnpm vitest src/nostr-overlay/components/ChatModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement message status UI**
Render status badge text based on `deliveryState` and keep undecryptable placeholder unchanged.

- [ ] **Step 4: Run GREEN**
Run: `pnpm vitest src/nostr-overlay/components/ChatModal.test.tsx`
Expected: PASS.

## Chunk 4: End-To-End Regression Sweep

### Task 7: Verificacion funcional completa sin mocks de produccion

**Files:**
- Verify: `src/nostr/**`
- Verify: `src/nostr-overlay/**`

- [ ] **Step 1: Run focused suites**
Run:
- `pnpm vitest src/nostr/auth/session.test.ts`
- `pnpm vitest src/nostr/dm-service.test.ts src/nostr/dm-runtime-service.test.ts`
- `pnpm vitest src/nostr-overlay/hooks/useDirectMessages.test.ts`
- `pnpm vitest src/nostr-overlay/components/ChatModal.test.tsx`
- `pnpm vitest src/nostr-overlay/App.test.tsx --runInBand`

- [ ] **Step 2: Run broader safety net**
Run: `pnpm vitest`
Expected: PASS.

- [ ] **Step 3: Prepare integration summary**
Document what changed in DM receive/send/backfill and capability-gating behavior.
