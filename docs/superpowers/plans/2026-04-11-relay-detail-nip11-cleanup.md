# Relay Detail NIP-11 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en detalle de relay solo informacion util y real de protocolo NIP-11, incluyendo admin pubkey en formato npub + hex copiable.

**Architecture:** Se mantiene la carga de metadata NIP-11 por HTTP con `Accept: application/nostr+json`, pero se reorganiza la vista de detalle para priorizar identidad, admin/contacto, software y capacidades. Se eliminan campos derivados localmente de URL que no pertenecen al documento NIP-11, y se corrige la carga para que el detalle no quede bloqueado en `loading` al abrirse rapido.

**Tech Stack:** React 19, TypeScript, Vitest, Nostr NIP-11/NIP-19 helpers existentes.

---

### Task 1: Definir cobertura de tests para comportamiento objetivo

**Files:**
- Modify: `src/nostr-overlay/components/MapSettingsDialog.test.tsx`

- [x] **Step 1: Write failing tests for relay detail content and ordering**
- [x] **Step 2: Write failing test for fast-open relay detail metadata loading**
- [x] **Step 3: Run targeted tests and confirm RED state**

### Task 2: Reestructurar Relay Detail con enfoque NIP-11

**Files:**
- Modify: `src/nostr-overlay/components/MapSettingsDialog.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [x] **Step 1: Add helpers for admin pubkey (npub + hex)**
- [x] **Step 2: Remove URL-derived fields (path/protocol/transport/port/host) from detail table**
- [x] **Step 3: Reorder rows by utility (identity, admin/contact, software/capabilities, policy/limits, payments/terms)**
- [x] **Step 4: Hide empty/unknown rows and show concise fallback message**
- [x] **Step 5: Add copy action for admin hex and optional npub copy**

### Task 3: Hacer robusta la carga de metadata al abrir detalle

**Files:**
- Modify: `src/nostr-overlay/components/MapSettingsDialog.tsx`

- [x] **Step 1: Ensure NIP-11 fetching runs for both `relays` and `relay-detail` views**
- [x] **Step 2: Avoid cancellation race that drops successful responses during view transition**
- [x] **Step 3: Keep existing loading/error states per relay URL**

### Task 4: Verificacion final

**Files:**
- Modify: `src/nostr-overlay/components/MapSettingsDialog.test.tsx` (if needed for assertions)

- [x] **Step 1: Run `pnpm test:unit -- src/nostr-overlay/components/MapSettingsDialog.test.tsx`**
- [x] **Step 2: Run full `pnpm test:unit` if targeted tests pass**
- [x] **Step 3: Confirm no regressions in relay table interaction basics**

## Execution note

`pnpm test:unit` still reports one unrelated pre-existing failure in `src/nostr-overlay/App.test.tsx` (`applies traffic settings on mount and after UI slider updates`). The relay-detail changes and their dedicated tests pass.
