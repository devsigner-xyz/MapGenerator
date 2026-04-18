# Active Profile Relays Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en el dialogo de detalle de usuario los relays declarados por ese perfil (NIP-65 y NIP-17 DM inbox) y permitir agregarlos a la lista local de relays del usuario actual.

**Architecture:** El flujo se mantiene sobre el servicio de perfil activo existente (`useActiveProfileQuery` + `activeProfileService.loadNetwork`), extendiendo su contrato para incluir sugerencias de relays por tipo. La carga de relays del perfil objetivo se hace leyendo kind `10002` y `10050` via `NostrClient`, parseando con helpers existentes de `relay-policy`, con fallback seguro a listas vacias si hay timeout o error. La UI del dialogo consume ese contrato y emite callbacks de "agregar relay" que `App.tsx` persiste mediante `relay-settings` scoped por `ownerPubkey`.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Vitest, Nostr NIP-65/NIP-17 helpers (`relay-policy.ts`, `relay-settings.ts`).

---

## File Structure

- Modify: `src/nostr-overlay/query/active-profile.query.ts`
  - Extender el contrato `ActiveProfileNetworkResult` para transportar `relaySuggestionsByType`.
- Modify: `src/nostr-overlay/query/active-profile.query.test.ts`
  - Cubrir defaults y passthrough del nuevo campo en el hook.
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
  - En `activeProfileService.loadNetwork`, cargar y parsear kinds `10002` y `10050` del perfil activo.
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.tsx`
  - Renderizar seccion de relays del perfil y acciones "Añadir"/"Añadir todos".
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
  - Validar render y callbacks de agregado de relays.
- Modify: `src/nostr-overlay/App.tsx`
  - Pasar datos/callbacks de relays al dialogo y persistir cambios con `saveRelaySettings`.
- Modify: `src/nostr-overlay/App.test.tsx`
  - Validar integracion: carga de relays del perfil activo y persistencia al agregarlos.

## Chunk 1: Data Contracts + Relay Fetch

### Task 1: Extender contrato de query de perfil activo

**Files:**
- Modify: `src/nostr-overlay/query/active-profile.query.ts`
- Modify: `src/nostr-overlay/query/active-profile.query.test.ts`

- [ ] **Step 1: Write failing tests for relaySuggestionsByType defaults and passthrough**

```ts
test('returns empty relay suggestions when network service omits them', async () => {
  const service: ActiveProfileQueryService = {
    loadPosts: async () => page([]),
    loadStats: async () => ({ followsCount: 0, followersCount: 0 }),
    loadNetwork: async () => ({ follows: [], followers: [], profiles: {} }),
  };
  // expect(latest.relaySuggestionsByType).toEqual({ nip65Both: [], nip65Read: [], nip65Write: [], dmInbox: [] })
});

test('passes relaySuggestionsByType from service response', async () => {
  // loadNetwork returns non-empty relaySuggestionsByType
  // expect hook output to match exactly
});
```

- [ ] **Step 2: Run targeted tests and verify RED state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/query/active-profile.query.test.ts`
Expected: FAIL with missing `relaySuggestionsByType` field in query state.

- [ ] **Step 3: Implement minimal query contract changes**

```ts
export interface ActiveProfileNetworkResult {
  follows: string[];
  followers: string[];
  profiles: Record<string, NostrProfile>;
  relaySuggestionsByType: RelaySettingsByType;
}

const EMPTY_NETWORK: ActiveProfileNetworkResult = {
  follows: [],
  followers: [],
  profiles: {},
  relaySuggestionsByType: { nip65Both: [], nip65Read: [], nip65Write: [], dmInbox: [] },
};
```

- [ ] **Step 4: Re-run targeted tests and verify GREEN state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/query/active-profile.query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/query/active-profile.query.ts src/nostr-overlay/query/active-profile.query.test.ts
git commit -m "test+feat: extend active profile query with relay suggestions"
```

### Task 2: Cargar relays (kind 10002 + 10050) del perfil seleccionado

**Files:**
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing integration test for active-profile relay loading**

```ts
test('loads selected profile relay suggestions from kind 10002 and 10050', async () => {
  // arrange client.fetchLatestReplaceableEvent(pubkey, 10002/10050)
  // open occupant profile
  // expect relay rows/badges from parsed byType in dialog
});
```

- [ ] **Step 2: Run focused test and verify RED state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx -t "loads selected profile relay suggestions"`
Expected: FAIL because relay suggestions are not loaded for active profile network.

- [ ] **Step 3: Implement relay fetch in activeProfileService.loadNetwork**

```ts
const [followsResult, followersResult, relayListEvent, dmInboxRelayListEvent] = await Promise.all([
  graphApiService.loadFollows({ ownerPubkey, pubkey }),
  graphApiService.loadFollowers({ ownerPubkey, pubkey, candidateAuthors: current.data.follows }),
  withTimeout(client.fetchLatestReplaceableEvent(pubkey, 10002), RELAY_METADATA_TIMEOUT_MS, '...10002...'),
  withTimeout(client.fetchLatestReplaceableEvent(pubkey, 10050), RELAY_METADATA_TIMEOUT_MS, '...10050...'),
]);

const relaySuggestionsByType = {
  ...relaySuggestionsByTypeFromKind10002Event(relayListEvent),
  dmInbox: dmInboxRelayListFromKind10050Event(dmInboxRelayListEvent),
};
```

If relay loading throws/timeout: return follows/followers/profiles with `relaySuggestionsByType` empty (no hard failure).

- [ ] **Step 4: Re-run focused test and verify GREEN state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx -t "loads selected profile relay suggestions"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/hooks/useNostrOverlay.ts src/nostr-overlay/App.test.tsx
git commit -m "feat: load NIP-65 and DM inbox relays for active profile"
```

## Chunk 2: UI + Persistence Wiring

### Task 3: Mostrar relays del perfil en OccupantProfileDialog

**Files:**
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.tsx`
- Test: `src/nostr-overlay/components/OccupantProfileDialog.test.tsx`

- [ ] **Step 1: Write failing component tests for relay list rendering and actions**

```ts
test('shows active profile relays in info tab with relay type badges', async () => {
  // render with relaySuggestionsByType containing nip65 + dmInbox
  // expect relay host/url text and badges
});

test('calls add relay callbacks for single relay and add all', async () => {
  // click "Añadir" and "Añadir todos"
  // expect onAddRelaySuggestion / onAddAllRelaySuggestions called
});
```

- [ ] **Step 2: Run targeted dialog tests and verify RED state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
Expected: FAIL due missing relay section/props.

- [ ] **Step 3: Implement relay section and add actions in dialog**

Implementation details:
- Add props:
  - `relaySuggestionsByType?: RelaySettingsByType`
  - `onAddRelaySuggestion?: (relayUrl: string, relayTypes: RelayType[]) => void | Promise<void>`
  - `onAddAllRelaySuggestions?: (input: Array<{ relayUrl: string; relayTypes: RelayType[] }>) => void | Promise<void>`
- Build relay rows from `relaySuggestionsByType` and render in Info tab using existing `ItemGroup`, `Badge`, and `Button`.
- Hide actions when callbacks are absent or there are no relays.

- [ ] **Step 4: Re-run targeted dialog tests and verify GREEN state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/components/OccupantProfileDialog.tsx src/nostr-overlay/components/OccupantProfileDialog.test.tsx
git commit -m "feat: show and add profile relays from occupant dialog"
```

### Task 4: Conectar App.tsx para persistir "añadir relay" en settings locales

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing integration test for app-level relay persistence from dialog**

```ts
test('adds selected active-profile relay into scoped relay settings', async () => {
  // open profile dialog
  // click add relay action
  // expect local scoped settings to include the relay by type
  // expect relay status summary targets update
});
```

- [ ] **Step 2: Run focused app test and verify RED state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx -t "adds selected active-profile relay"`
Expected: FAIL because dialog callbacks are not wired to persistence.

- [ ] **Step 3: Implement App wiring and persistence callbacks**

```ts
const addSuggestedRelayToSettings = useCallback((relayUrl: string, relayTypes: RelayType[]) => {
  const ownerInput = relaySettingsOwnerPubkey ? { ownerPubkey: relaySettingsOwnerPubkey } : undefined;
  let next = loadRelaySettings(ownerInput);
  for (const relayType of relayTypes) {
    next = addRelay(next, relayUrl, relayType);
  }
  const saved = saveRelaySettings(next, ownerInput);
  setRelaySettingsSnapshot(saved);
}, [relaySettingsOwnerPubkey]);
```

Pass to dialog:
- `relaySuggestionsByType={activeProfileData.relaySuggestionsByType}`
- `onAddRelaySuggestion={addSuggestedRelayToSettings}`
- `onAddAllRelaySuggestions={...batch loop over rows...}`

- [ ] **Step 4: Re-run focused app test and verify GREEN state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx -t "adds selected active-profile relay"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/App.tsx src/nostr-overlay/App.test.tsx
git commit -m "feat: persist relays imported from active profile dialog"
```

### Task 5: Verificacion final de la feature

**Files:**
- Modify: `src/nostr-overlay/App.test.tsx` (only if assertion fixes are needed)

- [ ] **Step 1: Run focused frontend tests for touched modules**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/query/active-profile.query.test.ts src/nostr-overlay/components/OccupantProfileDialog.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run frontend typecheck**

Run: `pnpm typecheck:frontend`
Expected: PASS.

- [ ] **Step 3: Run full frontend unit suite if all focused checks pass**

Run: `pnpm test:unit:frontend`
Expected: PASS or only pre-existing unrelated failures documented in execution notes.

- [ ] **Step 4: Validate behavior manually in UI**

Run: `pnpm dev`
Expected manual checks:
- Open user detail dialog -> Info tab shows relay list by type.
- "Añadir" agrega relay y lo refleja en `/relays`.
- "Añadir todos" agrega lote sin duplicados.

- [ ] **Step 5: Commit verification notes (if needed)**

```bash
git add docs/superpowers/plans/2026-04-18-active-profile-relays-import.md
git commit -m "docs: capture verification notes for active profile relay import"
```
