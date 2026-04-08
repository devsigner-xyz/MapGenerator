# Street Labels Canvas Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar nombres de calles integrados en el canvas del mapa, visibles desde un zoom configurable (default 10), desactivables por UI, usando usernames presentes como fuente principal y un pool Nostr editable como fallback.

**Architecture:** El render de etiquetas se hace en el pipeline nativo de `DefaultStyle.draw()` para máxima integración visual con carreteras y cámara (pan/zoom). La generación de texto y geometría de labels vive en módulos de dominio puros y testeables (`street_labels.ts`, `street-label-users.ts`). El overlay React solo configura estado y envía usernames/ajustes al motor del mapa; no renderiza etiquetas de calles.

**Tech Stack:** TypeScript, Vite, React 19, Vitest, canvas 2D API.

---

## Scope Guardrails

- In scope: `DefaultStyle` canvas render only.
- Out of scope: `RoughStyle/Drawn` support, SVG export of street labels.
- Naming rules:
  - Priority 1: `[USERNAME] <SUFFIX>` from people present on map.
  - Priority 2: fallback bases from editable data file.
  - Suffix chosen deterministically from `Street | Avenue | Lane | Road | Boulevard | Way`.

## File Structure

### Create

- `src/data/street-name-pool.json`
  - Editable pool with `suffixes` and `fallbackBases` (Nostr-focused terms).
- `src/ts/ui/street_labels.ts`
  - Pure domain logic for name composition, deterministic selection, and longitudinal label placement.
- `src/ts/ui/street_labels.test.ts`
  - Unit tests for placement, angle normalization, dedupe, fallback, and zoom/toggle gating.
- `src/nostr-overlay/domain/street-label-users.ts`
  - Extract/normalize usernames from `occupancyByBuildingIndex` + `profiles`.
- `src/nostr-overlay/domain/street-label-users.test.ts`
  - Unit tests for normalization, dedupe, and empty/malformed profile handling.

### Modify

- `src/ts/ui/canvas_wrapper.ts`
  - Add rotated text drawing primitive for `DefaultCanvasWrapper`.
- `src/ts/ui/style.ts`
  - Add street label render data and draw it in `DefaultStyle.draw()`.
- `src/ts/ui/main_gui.ts`
  - Keep street label state (enabled, zoom threshold, usernames) and prepare draw data.
- `src/main.ts`
  - Expose API methods for street-label settings/usernames.
- `src/nostr-overlay/map-bridge.ts`
  - Bridge optional methods to map API.
- `src/nostr-overlay/map-bridge.test.ts`
  - Cover new bridge delegations.
- `src/nostr-overlay/App.tsx`
  - Send usernames + settings to map bridge from overlay state.
- `src/nostr/ui-settings.ts`
  - Persist `streetLabelsEnabled` + `streetLabelsZoomLevel`.
- `src/nostr/ui-settings.test.ts`
  - Validate defaults and normalization for new settings.
- `src/nostr-overlay/components/MapSettingsModal.tsx`
  - Add toggle and slider controls for street labels.
- `src/nostr-overlay/components/MapSettingsModal.test.tsx`
  - Assert UI and persistence for new controls.

## Chunk 1: Data + Domain Logic

### Task 1: Create editable street name pool data

**Files:**
- Create: `src/data/street-name-pool.json`
- Test: `src/ts/ui/street_labels.test.ts`

- [ ] **Step 1: Add pool file with refined Nostr entities**

```json
{
  "suffixes": ["Street", "Avenue", "Lane", "Road", "Boulevard", "Way"],
  "fallbackBases": [
    "Relay",
    "Zap",
    "Pubkey",
    "Nostr Event",
    "Schnorr",
    "NIP-01",
    "NIP-03",
    "NIP-05",
    "NIP-11",
    "NIP-17",
    "NIP-19",
    "NIP-57",
    "NIP-65",
    "Kind 0",
    "Kind 1",
    "Kind 3",
    "Kind 10002",
    "Bech32",
    "Outbox",
    "Inbox"
  ]
}
```

- [ ] **Step 2: Add failing test for pool fallback consumption**

```ts
test('buildStreetNames uses fallback pool when usernames are insufficient', () => {
  const names = buildStreetNames({
    usernames: ['alice'],
    desiredCount: 3,
    seed: 'seed-1',
    pool
  });
  expect(names).toHaveLength(3);
  expect(names[0]).toMatch(/^alice\s(Street|Avenue|Lane|Road|Boulevard|Way)$/);
  expect(names[1]).toMatch(/(Relay|Zap|NIP-03|NIP-57)/);
});
```

- [ ] **Step 3: Run failing test**

Run: `pnpm test:unit src/ts/ui/street_labels.test.ts -t "fallback"`

Expected: FAIL (function not implemented yet).

- [ ] **Step 4: Commit data-only slice (optional if batched with Task 2)**

```bash
git add src/data/street-name-pool.json
git commit -m "chore: add editable nostr street name pool"
```

### Task 2: Implement pure street label engine

**Files:**
- Create: `src/ts/ui/street_labels.ts`
- Test: `src/ts/ui/street_labels.test.ts`

- [ ] **Step 1: Write failing tests for deterministic naming and longitudinal placement**

```ts
test('normalizes angle to keep text upright', () => {
  const angle = normalizeTextAngle(Math.PI * 0.9);
  expect(angle).toBeLessThanOrEqual(Math.PI / 2);
  expect(angle).toBeGreaterThanOrEqual(-Math.PI / 2);
});

test('createStreetLabels returns empty when disabled or zoom below threshold', () => {
  expect(createStreetLabels({ enabled: false, zoom: 15, zoomThreshold: 10, roads: [] })).toEqual([]);
  expect(createStreetLabels({ enabled: true, zoom: 9, zoomThreshold: 10, roads: [] })).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test:unit src/ts/ui/street_labels.test.ts`

Expected: FAIL with missing exports/behavior.

- [ ] **Step 3: Implement minimal domain API in `street_labels.ts`**

```ts
export interface StreetNamePool { suffixes: string[]; fallbackBases: string[] }
export interface StreetLabel { text: string; anchor: Vector; angleRad: number }

export function buildStreetNames(...): string[] { /* deterministic username + fallback composition */ }
export function normalizeTextAngle(angleRad: number): number { /* clamp to [-pi/2, pi/2] */ }
export function createStreetLabels(...): StreetLabel[] { /* filter short roads, choose anchor, enforce spacing */ }
```

Implementation constraints:
- deterministic order/selection from `seed`;
- skip empty usernames;
- avoid duplicate generated names;
- ignore roads with too-short screen length;
- spacing gate between label anchors to reduce clutter.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test:unit src/ts/ui/street_labels.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ts/ui/street_labels.ts src/ts/ui/street_labels.test.ts src/data/street-name-pool.json
git commit -m "feat: add deterministic street label generation and placement"
```

### Task 3: Extract usernames from overlay data

**Files:**
- Create: `src/nostr-overlay/domain/street-label-users.ts`
- Test: `src/nostr-overlay/domain/street-label-users.test.ts`

- [ ] **Step 1: Write failing tests for username extraction**

```ts
test('extracts unique usernames from occupied profiles preserving first-seen order', () => {
  const usernames = extractStreetLabelUsernames({ occupancyByBuildingIndex, profiles });
  expect(usernames).toEqual(['alice', 'bob']);
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm test:unit src/nostr-overlay/domain/street-label-users.test.ts`

Expected: FAIL (module missing).

- [ ] **Step 3: Implement extractor**

Rules:
- Resolve display name with priority: `displayName` -> `name`.
- Trim/collapse whitespace.
- Reject blank results.
- Dedupe by normalized lowercase key, preserve first occurrence display casing.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test:unit src/nostr-overlay/domain/street-label-users.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/domain/street-label-users.ts src/nostr-overlay/domain/street-label-users.test.ts
git commit -m "feat: derive street label usernames from occupied profiles"
```

## Chunk 2: Rendering + Integration + Settings

### Task 4: Add canvas rotated text primitive

**Files:**
- Modify: `src/ts/ui/canvas_wrapper.ts`
- Test: `src/ts/ui/street_labels.test.ts`

- [ ] **Step 1: Add failing test for render contract (if using spy/mocked wrapper)**

Target behavior: method exists and can be called with angle/anchor without throwing.

- [ ] **Step 2: Implement method in wrappers**

In `CanvasWrapper` add abstract:

```ts
abstract drawRotatedText(text: string, center: Vector, angleRad: number, fontPx: number): void;
```

In `DefaultCanvasWrapper` implement via `ctx.save/translate/rotate/fillText/restore`.

In `RoughCanvasWrapper` add safe no-op implementation.

- [ ] **Step 3: Run targeted tests**

Run: `pnpm test:unit src/ts/ui/street_labels.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ts/ui/canvas_wrapper.ts
git commit -m "feat: add rotated text primitive for default canvas"
```

### Task 5: Render street labels in `DefaultStyle` and wire map state

**Files:**
- Modify: `src/ts/ui/style.ts`
- Modify: `src/ts/ui/main_gui.ts`

- [ ] **Step 1: Add failing tests in `street_labels.test.ts` for label gating**

Cases:
- disabled => no labels;
- zoom below threshold => no labels;
- enabled and zoom high => labels exist.

- [ ] **Step 2: Implement style data fields and drawing in `DefaultStyle.draw()`**

Add style state:

```ts
public streetLabelsEnabled = true;
public streetLabelsZoomLevel = 10;
public streetLabels: StreetLabel[] = [];
```

Draw order: after roads are drawn and before buildings.

- [ ] **Step 3: Implement `MainGUI` integration**

Add state + setters:

```ts
setStreetLabelsEnabled(enabled: boolean): void
setStreetLabelsZoomLevel(level: number): void
setStreetLabelUsernames(usernames: string[]): void
```

In `draw(...)`, compute `style.streetLabels` from current roads + pool + usernames using `createStreetLabels(...)`.

- [ ] **Step 4: Run tests**

Run: `pnpm test:unit src/ts/ui/street_labels.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ts/ui/style.ts src/ts/ui/main_gui.ts src/ts/ui/street_labels.ts
git commit -m "feat: render longitudinal street labels in default style"
```

### Task 6: Expose API + map bridge + settings UI

**Files:**
- Modify: `src/main.ts`
- Modify: `src/nostr-overlay/map-bridge.ts`
- Modify: `src/nostr-overlay/map-bridge.test.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr/ui-settings.ts`
- Modify: `src/nostr/ui-settings.test.ts`
- Modify: `src/nostr-overlay/components/MapSettingsModal.tsx`
- Modify: `src/nostr-overlay/components/MapSettingsModal.test.tsx`

- [ ] **Step 1: Add failing tests for settings defaults and bridge delegation**

`ui-settings` expectations:
- `streetLabelsEnabled` defaults `true`;
- `streetLabelsZoomLevel` defaults `10` and clamps to `1..20`.

`map-bridge` expectations:
- delegates calls when optional methods exist.

- [ ] **Step 2: Implement settings persistence**

Add fields to `UiSettingsState` and normalization in save/load.

- [ ] **Step 3: Implement settings controls in modal**

UI section additions:
- Toggle: `Street labels` (`aria-label="Street labels enabled"`).
- Slider: `Street labels zoom level` (`1..20`).

Persist through `saveUiSettings` and trigger `onUiSettingsChange`.

- [ ] **Step 4: Wire bridge and app effects**

In `main.ts` API surface:

```ts
setStreetLabelsEnabled(enabled: boolean): void
setStreetLabelsZoomLevel(level: number): void
setStreetLabelUsernames(usernames: string[]): void
```

In `map-bridge.ts`: optional delegates to above methods.

In `App.tsx`:
- derive usernames via `extractStreetLabelUsernames(...)` from `overlay.occupancyByBuildingIndex` and `overlay.profiles`;
- push usernames to bridge in `useEffect`;
- push `uiSettings.streetLabelsEnabled` and `uiSettings.streetLabelsZoomLevel` to bridge in `useEffect`.

- [ ] **Step 5: Run tests for updated modules**

Run:
- `pnpm test:unit src/nostr/ui-settings.test.ts`
- `pnpm test:unit src/nostr-overlay/map-bridge.test.ts`
- `pnpm test:unit src/nostr-overlay/components/MapSettingsModal.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/nostr-overlay/map-bridge.ts src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/App.tsx src/nostr/ui-settings.ts src/nostr/ui-settings.test.ts src/nostr-overlay/components/MapSettingsModal.tsx src/nostr-overlay/components/MapSettingsModal.test.tsx src/nostr-overlay/domain/street-label-users.ts
git commit -m "feat: add configurable street label settings and bridge wiring"
```

### Task 7: End-to-end verification and cleanup

**Files:**
- Modify (if needed): any files touched above

- [ ] **Step 1: Run full unit suite**

Run: `pnpm test:unit`

Expected: PASS.

- [ ] **Step 2: Run type checks**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Manual behavior verification**

Checklist:
- zoom < threshold: no street labels;
- zoom >= threshold and toggle ON: labels visible;
- toggle OFF: labels always hidden;
- occupied usernames appear first;
- fallback names fill remaining slots;
- labels remain aligned while pan/zoom.

- [ ] **Step 5: Final commit (if verification required follow-up changes)**

```bash
git add -A
git commit -m "test: verify street label canvas integration"
```

## Notes for Implementer

- Keep this phase minimal (YAGNI): no collision engine beyond simple spacing gate.
- Determinism is required: same map seed + same username set should produce stable names.
- Do not break existing occupant overlay behavior.
- If a test is flaky due to rendering timing, move logic into pure helpers and test there.
