# User-Scoped Persistence for Overlay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar persistencia por usuario Nostr (pubkey) para estados que representan progreso/preferencias de cuenta, manteniendo estados de UI globales por dispositivo.

**Architecture:** Introducir claves de storage con scope de usuario para datos user-scoped (`easter-egg-progress`, `zap-settings`, y luego `relay-settings`), con migracion suave desde claves globales legacy. El logout limpia estado en memoria, no borra progreso persistido por cuenta. Estados device-scoped (`ui-settings`) permanecen globales.

**Tech Stack:** React 19, TypeScript, Vitest, localStorage, React Router, TanStack Query.

---

## Chunk 1: Scope Model + Storage Key Helpers

### Task 1: Definir taxonomia de persistencia y utilidades de key scoped

**Files:**
- Create: `src/nostr/storage-scope.ts`
- Create: `src/nostr/storage-scope.test.ts`
- Modify: `docs/superpowers/plans/2026-04-13-user-scoped-persistence-overlay.md` (si se necesita aclarar decisiones)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { buildScopedStorageKey } from './storage-scope';

describe('buildScopedStorageKey', () => {
  test('builds user-scoped key when pubkey exists', () => {
    expect(buildScopedStorageKey('nostr.overlay.easter-eggs.v1', 'a'.repeat(64))).toBe(
      `nostr.overlay.easter-eggs.v1:user:${'a'.repeat(64)}`
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/nostr/storage-scope.test.ts`
Expected: FAIL por modulo/funcion inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildScopedStorageKey(baseKey: string, pubkey?: string): string {
  const normalized = typeof pubkey === 'string' ? pubkey.trim().toLowerCase() : '';
  return normalized ? `${baseKey}:user:${normalized}` : baseKey;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/nostr/storage-scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr/storage-scope.ts src/nostr/storage-scope.test.ts
git commit -m "feat: add scoped storage key helper for user-bound persistence"
```

## Chunk 2: Easter Eggs as User-Scoped (highest priority)

### Task 2: Migrar `easter-egg-progress` de global a user-scoped con fallback legacy

**Files:**
- Modify: `src/nostr/easter-egg-progress.ts`
- Modify: `src/nostr/easter-egg-progress.test.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing tests for per-user isolation and migration**

```ts
test('keeps separate progress per pubkey and falls back from legacy key once', () => {
  // userA ve progreso legado, userB no, y escrituras nuevas quedan en key scoped
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/nostr/easter-egg-progress.test.ts src/nostr-overlay/App.test.tsx`
Expected: FAIL en escenarios multi-cuenta.

- [ ] **Step 3: Implement minimal scoped API + migration behavior**

```ts
loadEasterEggProgress({ ownerPubkey?, storage? })
saveEasterEggProgress(state, { ownerPubkey?, storage? })
markEasterEggDiscovered({ easterEggId, currentState, ownerPubkey?, storage? })
```

Requisitos:
- Leer/escribir por key scoped si hay `ownerPubkey`.
- Si no existe key scoped pero existe key global legacy, migrar una sola vez para el primer usuario que lo consuma y marcar la migracion como completada (o eliminar/consumir la key legacy) para evitar que user2 herede datos de user1.
- No borrar datos de otros usuarios.

- [ ] **Step 4: Wire en App por usuario autenticado**

En `App.tsx`:
- Cargar progreso con `overlay.ownerPubkey`.
- Al cambiar `ownerPubkey`, refrescar `easterEggProgress` desde storage scoped.
- En logout, limpiar estado en memoria (`setEasterEggProgress([])`), sin destruir persistencia scoped.

- [ ] **Step 5: Run tests and verify pass**

Run: `pnpm vitest run src/nostr/easter-egg-progress.test.ts src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/nostr/easter-egg-progress.ts src/nostr/easter-egg-progress.test.ts src/nostr-overlay/App.tsx src/nostr-overlay/App.test.tsx
git commit -m "feat: scope discover progress by user pubkey with legacy migration"
```

## Chunk 3: Zap Settings as User-Scoped

### Task 3: Separar presets de zaps por cuenta

**Files:**
- Modify: `src/nostr/zap-settings.ts`
- Modify: `src/nostr/zap-settings.test.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/MapSettingsPage.tsx`
- Modify: `src/nostr-overlay/components/MapSettingsPage.test.tsx`

- [ ] **Step 1: Write failing tests for user A/B zap separation**
- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run src/nostr/zap-settings.test.ts src/nostr-overlay/components/MapSettingsPage.test.tsx`
Expected: FAIL en casos cross-account.

- [ ] **Step 3: Implement scoped key in zap settings API**

```ts
loadZapSettings({ ownerPubkey?, storage? })
saveZapSettings(state, { ownerPubkey?, storage? })
```

- [ ] **Step 4: Pass owner scope from App/Settings UI**

En `App.tsx` y `MapSettingsPage.tsx`:
- usar `overlay.ownerPubkey` para load/save.
- mantener fallback global cuando no hay sesion (modo anonimo).

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm vitest run src/nostr/zap-settings.test.ts src/nostr-overlay/components/MapSettingsPage.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/nostr/zap-settings.ts src/nostr/zap-settings.test.ts src/nostr-overlay/App.tsx src/nostr-overlay/components/MapSettingsPage.tsx src/nostr-overlay/components/MapSettingsPage.test.tsx
git commit -m "feat: scope zap settings by authenticated user"
```

## Chunk 4: Relay Settings as User-Scoped (larger blast radius)

### Task 4: Migrar relays a scope de usuario sin romper servicios runtime

**Files:**
- Modify: `src/nostr/relay-settings.ts`
- Modify: `src/nostr/relay-settings.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/components/MapSettingsPage.tsx`
- Modify: `src/nostr-overlay/components/ProfileTab.tsx`
- Modify: `src/nostr-overlay/components/ProfileTab.test.tsx`
- Modify: `src/nostr/social-feed-runtime-service.ts`
- Modify: `src/nostr/social-feed-runtime-service.test.ts`
- Modify: `src/nostr/social-notifications-runtime-service.ts`
- Modify: `src/nostr/dm-runtime-service.ts`
- Modify: `src/nostr/dm-service.test.ts`

- [ ] **Step 1: Write failing tests for per-user relay config retrieval**
- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm vitest run src/nostr/relay-settings.test.ts`
Expected: FAIL en aislamiento A/B y fallback legacy.

- [ ] **Step 3: Implement scoped relay storage API**

```ts
loadRelaySettings({ ownerPubkey?, storage? })
saveRelaySettings(state, { ownerPubkey?, storage? })
```

- [ ] **Step 4: Propagate owner scope through overlay runtime**

En `useNostrOverlay.ts`:
- usar `ownerPubkey` actual en lecturas de relay settings para construir runtime relays.

En servicios runtime:
- evitar lectura ciega global cuando exista owner activo.
- inyectar resolver/owner scope desde overlay si hace falta.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/nostr/relay-settings.test.ts src/nostr-overlay/components/MapSettingsPage.test.tsx src/nostr-overlay/components/ProfileTab.test.tsx src/nostr/social-feed-runtime-service.test.ts src/nostr/dm-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/nostr/relay-settings.ts src/nostr/relay-settings.test.ts src/nostr-overlay/hooks/useNostrOverlay.ts src/nostr-overlay/components/MapSettingsPage.tsx src/nostr-overlay/components/ProfileTab.tsx src/nostr/social-feed-runtime-service.ts src/nostr/social-notifications-runtime-service.ts src/nostr/dm-runtime-service.ts
git commit -m "feat: scope relay settings by user and preserve runtime relay resolution"
```

## Chunk 5: Contract and Regression Hardening

### Task 5: End-to-end account switching guarantees

**Files:**
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/no-legacy-guards.test.ts`
- Create: `src/nostr-overlay/persistence-scope.integration.test.tsx`

- [ ] **Step 1: Add account-switching regression tests**
  - user1 descubre/configura -> logout -> user2 limpio -> login user1 recupera.

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx src/nostr-overlay/no-legacy-guards.test.ts`
Expected: PASS.

- [ ] **Step 3: Full verification**

Run:
- `pnpm typecheck`
- `pnpm test`

Expected: PASS total.

- [ ] **Step 4: Commit**

```bash
git add src/nostr-overlay/App.test.tsx src/nostr-overlay/no-legacy-guards.test.ts src/nostr-overlay/persistence-scope.integration.test.tsx
git commit -m "test: enforce user-scoped persistence across logout/login account switching"
```
