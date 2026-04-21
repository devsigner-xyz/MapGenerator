# Relays Manual Add Read Write DM Section Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar el alta manual de relays generales, editar su uso NIP-65 con toggles `Read` / `Write` y separar `Relays de mensajes` en una sección propia prellenada con defaults recomendados.

**Architecture:** La implementación mantiene el modelo persistente actual (`nip65Both`, `nip65Read`, `nip65Write`, `dmInbox`, `search`) y cambia la interpretación de la UI. El alta manual general pasa a crear siempre `nip65Both`, la edición fina se hace con toggles que reescriben solo el estado NIP-65 del relay, y `dmInbox` se renderiza en una sección independiente con flujo parecido a `search`.

**Tech Stack:** React 19, TypeScript, CSS global de overlay, shadcn/ui Card/Table/Switch/InputGroup, Vitest.

---

## File Structure

- Modify: `src/nostr/relay-settings.ts`
  - Añadir helper mínimo para reescribir el estado NIP-65 efectivo de un relay sin tocar `dmInbox` ni `search`.
- Modify: `src/nostr/relay-settings.test.ts`
  - Cubrir transiciones `both/read/write/off` y reset de mensajes.
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts`
  - Quitar `newRelayType`, separar filas NIP-65 / DM / search y exponer handlers de toggles y de la nueva sección DM.
- Create: `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.test.ts`
  - Verificar la partición de secciones, la visibilidad de defaults DM y el nuevo handler NIP-65 sin depender solo del render de página.
- Create: `src/nostr-overlay/components/settings-routes/controllers/relay-section-partitions.ts`
  - Contener helpers puros para derivar filas configuradas y sugeridas de NIP-65, DM y search.
- Create: `src/nostr-overlay/components/settings-routes/controllers/relay-section-targets.ts`
  - Contener helpers puros para derivar targets de estado de conexión y metadata sin mezclar contadores DM con el resumen NIP-65.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
  - Simplificar el alta general y mantener el rol de orquestación de la página.
- Create: `src/nostr-overlay/components/settings-pages/SettingsDmRelaysSection.tsx`
  - Aislar la nueva sección `Relays de mensajes` para no seguir creciendo `SettingsRelaysPage.tsx`.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
  - Ajustar contrato de render a la nueva UX.
- Modify: `src/nostr-overlay/components/settings-routes/SettingsRelaysRoute.tsx`
  - Limpiar props eliminadas y pasar los nuevos handlers / colecciones.
- Modify: `src/nostr-overlay/components/RelaysRoute.tsx`
  - Mismo ajuste que en la ruta de settings embebida.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.tsx`
  - Sustituir `Categoria` por una representación de usos activos para relays configurados.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx`
  - Alinear la expectativa del detalle con la nueva representación.
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelayDetailController.ts`
  - Derivar usos activos para relays configurados y conservar el contrato actual para sugeridos.

## Chunk 1: Relay Settings Model

### Task 1: Cubrir el nuevo contrato NIP-65 con tests antes de tocar implementación

**Files:**
- Modify: `src/nostr/relay-settings.test.ts`

- [ ] **Step 1: Add a failing test for transitioning a relay between NIP-65 states**

Add a focused test that starts with a relay in `nip65Both`, then rewrites it to `read-only`, then `write-only`, then `off`.

Target assertions:

```ts
expect(getRelaySetByType(state, 'nip65Both')).toEqual([]);
expect(getRelaySetByType(state, 'nip65Read')).toEqual(['wss://relay.example']);
expect(getRelaySetByType(state, 'nip65Write')).toEqual([]);
```

- [ ] **Step 2: Add a failing test proving NIP-65 rewrites do not touch `dmInbox` or `search`**

Use a state where the same relay or sibling relays exist in `dmInbox` / `search`, then assert those lists remain unchanged after the NIP-65 rewrite helper runs.

- [ ] **Step 3: Add a focused test for the overlap case between NIP-65 and `dmInbox`**

Create one test where the same relay exists in `nip65Both` and `dmInbox`, then rewrite it to `{ read: false, write: false }` and assert:

```ts
expect(getRelaySetByType(state, 'nip65Both')).toEqual([]);
expect(getRelaySetByType(state, 'nip65Read')).toEqual([]);
expect(getRelaySetByType(state, 'nip65Write')).toEqual([]);
expect(getRelaySetByType(state, 'dmInbox')).toEqual(['wss://relay.example']);
```

- [ ] **Step 4: Run the relay-settings test file and verify RED state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr/relay-settings.test.ts`
Expected: FAIL because the rewrite helper does not exist yet.

### Task 2: Implement the minimal NIP-65 rewrite helper

**Files:**
- Modify: `src/nostr/relay-settings.ts`

- [ ] **Step 1: Add a small helper that removes one relay from the three NIP-65 lists**

Target shape:

```ts
function clearRelayFromNip65(byType: RelaySettingsByType, relayUrl: string): RelaySettingsByType {
  return {
    ...byType,
    nip65Both: byType.nip65Both.filter((relay) => relay !== relayUrl),
    nip65Read: byType.nip65Read.filter((relay) => relay !== relayUrl),
    nip65Write: byType.nip65Write.filter((relay) => relay !== relayUrl),
  };
}
```

- [ ] **Step 2: Add the public helper for setting NIP-65 access from read/write booleans**

Target shape:

```ts
export function setRelayNip65Access(
  state: RelaySettingsState,
  relayUrl: string,
  access: { read: boolean; write: boolean }
): RelaySettingsState {
  // normalize URL
  // clear from NIP-65 lists
  // reinsert into nip65Both / nip65Read / nip65Write as needed
  // preserve dmInbox and search
  // rebuild relays
}
```

- [ ] **Step 3: Export the DM defaults source needed by later chunks**

Add one explicit public API in `relay-settings.ts` so the controller can reset DM relays without duplicating literals.

Preferred shape:

```ts
export function getDefaultDmInboxRelays(): string[] {
  return [...DEFAULT_DM_INBOX_RELAYS];
}
```

- [ ] **Step 4: Keep the implementation minimal and derived from existing helpers**

Guardrails:
- reuse `normalizeRelayUrl`
- reuse `normalizeByType`
- reuse `buildAllRelays`
- do not add a parallel boolean-based storage model

- [ ] **Step 5: Re-run the relay-settings test file and verify GREEN state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr/relay-settings.test.ts`
Expected: PASS.

## Chunk 2: Controller State Separation

### Task 3: Remove `newRelayType` and split controller rows by section

**Files:**
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts`
- Create: `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.test.ts`
- Create: `src/nostr-overlay/components/settings-routes/controllers/relay-section-partitions.ts`
  - Contener la partición pura de filas configuradas/sugeridas por sección.
- Create: `src/nostr-overlay/components/settings-routes/controllers/relay-section-targets.ts`
  - Contener la derivación pura de targets para metadata y estado de conexión.
- Modify: `src/nostr-overlay/components/settings-routes/SettingsRelaysRoute.tsx`
- Modify: `src/nostr-overlay/components/RelaysRoute.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`

- [ ] **Step 1: Write focused controller tests before changing the hook**

Create `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.test.ts` with direct coverage for:
- no local payload => `dmConfiguredRows` includes the recommended defaults immediately
- persisted payload with `dmInbox: []` => `dmConfiguredRows` is empty
- `configuredRows` excludes DM-only relays
- `dmConfiguredRows` includes DM-only relays
- `suggestedRows` excludes DM-only suggestions
- `dmSuggestedRows` includes DM-only suggestions
- `onSetConfiguredRelayNip65Access(relay, { read: true, write: false })` rewrites the row into read-only state
- `onResetDmRelaysToDefault()` restores `getDefaultDmInboxRelays()`
- the main-table remove action clears only NIP-65 membership and preserves `dmInbox`
- `onResetRelaysToDefault()` restores NIP-65 rows but preserves both `dmConfiguredRows` and `searchConfiguredRows`
- search handlers still mutate only the `search` section
- DM rows participate in metadata/status target derivations
- DM-only relays do not change `connectedConfiguredRelays` or `disconnectedConfiguredRelays`

- [ ] **Step 2: Run the controller test file and verify RED state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.test.ts`
Expected: FAIL because the controller still lacks the separated contract.

- [ ] **Step 3: Add pure section-partition helpers in `relay-section-partitions.ts`**

Move the row partitioning logic into pure helpers for:
- NIP-65 configured/suggested rows
- DM configured/suggested rows
- search configured/suggested rows

Target helper contracts:

```ts
export function buildConfiguredSectionRows(byType: RelaySettingsByType): {
  configuredRows: RelayRow[];
  dmConfiguredRows: RelayRow[];
  searchConfiguredRows: RelayRow[];
}

export function buildSuggestedSectionRows(input: {
  relaySettings: RelaySettingsState;
  normalizedSuggestedByType: RelaySettingsByType;
}): {
  suggestedRows: RelayRow[];
  dmSuggestedRows: RelayRow[];
  searchSuggestedRows: RelayRow[];
}
```

- [ ] **Step 4: Add pure target-derivation helpers in `relay-section-targets.ts`**

Move target aggregation logic for:
- configured relay status targets
- suggested relay status targets
- relay metadata targets

Target helper contracts:

```ts
export function buildConfiguredRelayStatusTargets(input: {
  configuredRows: RelayRow[];
  dmConfiguredRows: RelayRow[];
  searchConfiguredRows: RelayRow[];
}): {
  nip65ConfiguredRelayStatusTargets: string[];
  dmConfiguredRelayStatusTargets: string[];
  searchConfiguredRelayStatusTargets: string[];
  allConfiguredRelayStatusTargets: string[];
};

export function buildSuggestedRelayStatusTargets(input: {
  configuredRelayStatusTargets: string[];
  suggestedRows: RelayRow[];
  dmSuggestedRows: RelayRow[];
  searchSuggestedRows: RelayRow[];
}): string[];

export function buildRelayInfoTargets(input: {
  relaySettings: RelaySettingsState;
  normalizedSuggestedByType: RelaySettingsByType;
}): string[];
```

Counting rule to preserve in those helpers:
- `connectedConfiguredRelays` / `disconnectedConfiguredRelays` remain scoped to the main NIP-65 table only
- DM rows may participate in their own metadata/status lookups, but not in the summary badges of `Relays configurados`

- [ ] **Step 5: Remove `newRelayType` and `onNewRelayTypeChange` from the controller contract**

Delete the public fields and remove the backing `useState<RelayType>('nip65Both')`.

- [ ] **Step 6: Change `onAddRelays` to always add general relays as `nip65Both`**

Replace the selected-type add path with:

```ts
nextState = addRelay(nextState, normalized, 'nip65Both');
```

- [ ] **Step 7: Introduce controller rows and handlers for the new DM section**

Add controller outputs for:

```ts
dmConfiguredRows
dmSuggestedRows
newDmRelayInput
invalidDmRelayInputs
onNewDmRelayInputChange
onAddDmRelays
onRemoveDmRelay
onAddSuggestedDmRelay
onAddAllSuggestedDmRelays
onResetDmRelaysToDefault
```

- [ ] **Step 8: Preserve the DM default contract exactly as specified**

Make the controller rely on persisted relay settings exactly as-is:
- no scoped payload => defaults already visible through `loadRelaySettings()`
- persisted `dmInbox: []` => do not rehydrate defaults in the controller

- [ ] **Step 9: Add one explicit controller API for per-row `Read` / `Write` updates**

Use exactly this public handler shape:

```ts
onSetConfiguredRelayNip65Access: (relayUrl: string, access: { read: boolean; write: boolean }) => void;
```

Internally call `setRelayNip65Access(...)` and persist.

- [ ] **Step 10: Keep both remove/reset behaviors scoped correctly**

Ensure:
- the main `onRemoveRelay` action removes only NIP-65 usage from the selected relay and does not delete `dmInbox` or `search`
- `onResetRelaysToDefault()` resets only NIP-65 rows and preserves DM/search
- `onResetDmRelaysToDefault()` resets only DM rows using `getDefaultDmInboxRelays()`

- [ ] **Step 11: Keep search handlers search-only**

Preserve the semantics of:
- `onAddSearchRelays`
- `onRemoveSearchRelay`
- `onAddSuggestedSearchRelay`
- `onAddAllSuggestedSearchRelays`
- `onResetSearchRelaysToDefault`

The controller tests from Step 1 must prove they affect only the `search` section.

- [ ] **Step 12: Update the route wrappers and page prop contract for the new controller shape**

In `SettingsRelaysRoute.tsx`, `RelaysRoute.tsx`, and the `SettingsRelaysPage.tsx` prop interface:
- remove `newRelayType`
- remove `onNewRelayTypeChange`
- add the new DM props
- add `onSetConfiguredRelayNip65Access`

- [ ] **Step 13: Add a minimal page render smoke for prop plumbing**

Update `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx` only enough to:
- remove the old `newRelayType` / `onNewRelayTypeChange` fixture fields
- add the new DM props and `onSetConfiguredRelayNip65Access`
- render the page successfully with the updated prop bag
- assert one stable marker such as `Relays configurados` is still present

- [ ] **Step 14: Re-run the controller test file and verify GREEN state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.test.ts`
Expected: PASS.

- [ ] **Step 15: Run the page render smoke and verify PASS**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: PASS for the temporary prop-shape/render smoke covered in Step 13.

- [ ] **Step 16: Run a concrete compile-level verification after the controller and route contract change**

Run: `pnpm exec tsc --noEmit`
Expected: PASS with no TypeScript errors from the new controller/route/page prop shapes.

## Chunk 3: Page UI

### Task 4: Replace the general category selector with toggles and add the DM section

**Files:**
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
- Create: `src/nostr-overlay/components/settings-pages/SettingsDmRelaysSection.tsx`

- [ ] **Step 1: Remove `newRelayType` and `onNewRelayTypeChange` from page props**

Delete the dropdown-related props and all JSX tied to:

```tsx
aria-label="Categoria del relay"
```

- [ ] **Step 2: Simplify the general add form to URL input + Add button only**

Target structure:

```tsx
<InputGroup>
  <InputGroupInput ... value={newRelayInput} onChange={...} />
  <InputGroupAddon align="inline-end">
    <InputGroupButton variant="secondary" onClick={onAddRelays}>Añadir</InputGroupButton>
  </InputGroupAddon>
</InputGroup>
```

- [ ] **Step 3: Replace the `Tipo` column in configured relays with `Read` and `Write` columns**

Target header shape:

```tsx
<TableHead>Read</TableHead>
<TableHead>Write</TableHead>
<TableHead>Estado</TableHead>
```

- [ ] **Step 4: Render `Switch` controls per configured relay row**

Use the effective compacted NIP-65 state of the row to derive:

```ts
const isReadEnabled = compactedRelayTypes.includes('nip65Both') || compactedRelayTypes.includes('nip65Read');
const isWriteEnabled = compactedRelayTypes.includes('nip65Both') || compactedRelayTypes.includes('nip65Write');
```

Each switch calls the new controller handler with the next boolean pair.

- [ ] **Step 5: Keep DM badges out of the main configured table**

The main table should no longer render `NIP-17 buzón DM` badges in the general NIP-65 block.

- [ ] **Step 6: Add the separate `Relays de mensajes` card below suggested relays and above search relays**

Implement it in `SettingsDmRelaysSection.tsx` and mount it from `SettingsRelaysPage.tsx` below suggested relays and above search relays.

Follow the existing `search` section pattern:

```tsx
<Card className="nostr-relay-dm nostr-relays-panel ...">
  <CardHeader>...</CardHeader>
  <CardContent>...</CardContent>
</Card>
```

Include:
- description text exactly covering:
  - `Se usan para recibir mensajes privados.`
  - `Esta lista corresponde al kind:10050.`
  - `Si tu perfil publica relays de DM, pueden aparecer como sugeridos.`
- reset button
- DM URL input
- configured DM table
- suggested DM table when present

- [ ] **Step 7: Wire every DM interaction in the extracted section explicitly**

`SettingsDmRelaysSection.tsx` must wire all DM interactions introduced in Chunk 2:
- input change
- add manual DM relay
- remove configured DM relay
- add one suggested DM relay
- add all suggested DM relays
- reset DM relays to defaults

- [ ] **Step 8: Reuse existing visual patterns instead of inventing a custom DM layout**

Guardrails:
- reuse current Card/Table/Button/InputGroup composition
- use `Switch` from `@/components/ui/switch`
- do not introduce new bespoke controls if existing shadcn/ui pieces already fit

- [ ] **Step 9: Run a concrete compile check after extracting the DM section**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

### Task 5: Update relay page tests to lock the new UX contract

**Files:**
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`

- [ ] **Step 1: Replace the old selector expectation with an explicit absence check**

Target assertion:

```ts
expect(rendered.container.querySelector('button[aria-label="Categoria del relay"]')).toBeNull();
```

- [ ] **Step 2: Add assertions for the new toggle columns and switches**

Examples:

```ts
expect(rendered.container.textContent || '').toContain('Read');
expect(rendered.container.textContent || '').toContain('Write');
expect(rendered.container.querySelectorAll('[data-slot="switch"]').length).toBeGreaterThan(0);
```

Also assert the interaction contract by clicking at least one switch and verifying the page-level callback stub receives the expected next `{ read, write }` payload.

Use one concrete example:
- relay initially `nip65Both`
- user disables `Write`
- callback receives `{ read: true, write: false }`

- [ ] **Step 3: Add assertions for the new `Relays de mensajes` section**

Check for:
- title present
- defaults visible in the DM configured section for a default-backed state fixture
- independent add/reset controls present
- a DM-only relay is absent from the main `Relays configurados` table
- a DM suggested table is rendered when `dmSuggestedRows` has entries
- DM suggested actions exist for add-one and add-all flows

- [ ] **Step 4: Run the relay page test file and verify GREEN state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: PASS.

## Chunk 4: Relay Detail + Verification

### Task 6: Replace single-category relay detail with active-use representation

**Files:**
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx`
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelayDetailController.ts`

- [ ] **Step 1: Extend the detail controller to derive active uses for configured relays**

Preferred output shape:

```ts
activeRelayTypes: RelayType[]
```

Derive this from the current stored `relaySettings.byType` when `source === 'configured'`.
For `source !== 'configured'`, keep the existing suggested-type behavior based on the route params / suggested relay context instead of reinterpreting from local state.
Use a stable order for `activeRelayTypes`: `nip65Both`, `nip65Read`, `nip65Write`, `dmInbox`, `search`.

- [ ] **Step 2: Replace the `Categoria` row in the detail page**

Target text:

```tsx
<TableHead className="nostr-relay-detail-key">Usos activos</TableHead>
```

Render the values as badges so the contract stays aligned with the rest of the relay UI and multiple active uses are visible at once.

Exact display rule:
- configured relays use heading `Usos activos`
- suggested relays keep heading `Categoria` and continue showing the suggested relay type contract

- [ ] **Step 3: Update detail-page tests to stop expecting a single category label**

Assert both paths explicitly:
- configured relay with multiple active uses renders `Usos activos`
- suggested relay still renders the suggested relay type contract without consulting local persisted state
- configured relay asserts the actual badges in stable order for one concrete case, for example:
  - `NIP-65 lectura+escritura`
  - `NIP-17 buzón DM`
  - `Búsqueda NIP-50`

- [ ] **Step 4: Run the focused detail test file**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx`
Expected: PASS.

### Task 7: Run focused verification for the full relay change set

**Verification targets:**
- `src/nostr/relay-settings.ts`
- `src/nostr/relay-settings.test.ts`
- `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts`
- `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
- `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
- `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.tsx`
- `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx`
- `src/nostr-overlay/components/settings-routes/controllers/useRelayDetailController.ts`
- `src/nostr-overlay/components/settings-routes/SettingsRelaysRoute.tsx`
- `src/nostr-overlay/components/RelaysRoute.tsx`

- [ ] **Step 1: Run the relay model tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr/relay-settings.test.ts`
Expected: PASS.

- [ ] **Step 2: Run the relay page tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run the relay detail tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 4: Run a concrete broader relay smoke**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Record final evidence in the implementation summary**

Capture:
- files changed
- tests executed
- whether DM defaults rendered as expected
- whether general manual add now defaults to `nip65Both`

Artifact:
- include this evidence in the final implementation response for the session; do not create a separate report file unless the user asks for one

Evidence source:
- cite the exact test commands from Steps 1-4 when summarizing DM defaults visibility and manual-add default-to-`nip65Both`
