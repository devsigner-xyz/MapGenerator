# Traffic Particles Street Follow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subtle traffic particles that move continuously and strictly along street lines, with fully random intersection choices, out-of-bounds respawn, and configurable count/speed in UI settings.

**Architecture:** Build a dedicated traffic simulation module that operates on a directed street-edge network derived from generated roads. Integrate simulation state into `MainGUI` update/draw flow and expose runtime controls via `MapBridge` from persisted UI settings. Keep rendering lightweight (particle core + halo) and avoid external animation libraries.

**Tech Stack:** TypeScript, React 19, dat.gui map core, HTML canvas rendering, Vitest, pnpm.

---

## File Structure and Responsibilities

- Modify: `src/nostr/ui-settings.ts`
  - Add persisted settings fields for traffic count/speed and normalization helpers.
- Modify: `src/nostr/ui-settings.test.ts`
  - Cover default values and clamp behavior for new settings.
- Modify: `src/nostr-overlay/components/MapSettingsModal.tsx`
  - Add sliders for `Cars in city` and `Cars speed` in UI tab.
- Modify: `src/nostr-overlay/components/MapSettingsModal.test.tsx`
  - Verify controls render and persist values.
- Modify: `src/nostr-overlay/map-bridge.ts`
  - Extend API contract and bridge delegations for traffic controls.
- Modify: `src/nostr-overlay/map-bridge.test.ts`
  - Verify new bridge methods delegate to map API.
- Modify: `src/nostr-overlay/App.tsx`
  - Propagate persisted UI settings to map bridge.
- Modify: `src/nostr-overlay/App.test.tsx`
  - Verify App applies traffic settings on initial mount.
- Create: `src/ts/ui/traffic_particles.ts`
  - Traffic network build + particle state + deterministic update and respawn logic.
- Create: `src/ts/ui/traffic_particles.test.ts`
  - Unit tests for movement continuity, intersection randomness, bounds respawn, and count zero.
- Modify: `src/ts/ui/main_gui.ts`
  - Own traffic simulation instance, wire update/draw integration, expose setters.
- Modify: `src/ts/ui/style.ts`
  - Extend style render payload and draw particles (halo in default style, minimal dot in rough style).
- Modify: `src/main.ts`
  - Compute `deltaSeconds` and pass into `MainGUI.update(deltaSeconds)`.

Implementation discipline for all tasks: `@superpowers/test-driven-development`, `@superpowers/systematic-debugging`, `@superpowers/verification-before-completion`.

## Chunk 1: Settings and Bridge Contracts

### Task 1: Add failing tests for UI settings persistence and modal controls

**Files:**
- Modify: `src/nostr/ui-settings.test.ts`
- Modify: `src/nostr-overlay/components/MapSettingsModal.test.tsx`

- [ ] **Step 1: Write failing defaults/clamp assertions for traffic settings in ui-settings tests**

```ts
expect(state.trafficParticlesCount).toBe(12);
expect(state.trafficParticlesSpeed).toBe(1);

const saved = saveUiSettings({
  occupiedLabelsZoomLevel: 8,
  streetLabelsEnabled: true,
  streetLabelsZoomLevel: 10,
  trafficParticlesCount: 999,
  trafficParticlesSpeed: -10,
}, window.localStorage);

expect(saved.trafficParticlesCount).toBe(50);
expect(saved.trafficParticlesSpeed).toBe(0.2);

const loaded = loadUiSettings(window.localStorage);
expect(loaded.trafficParticlesCount).toBe(50);
expect(loaded.trafficParticlesSpeed).toBe(0.2);
```

- [ ] **Step 2: Run ui-settings test file and confirm failures**

Run: `pnpm vitest run src/nostr/ui-settings.test.ts`
Expected: FAIL with missing `trafficParticlesCount` / `trafficParticlesSpeed` in state.

- [ ] **Step 3: Write failing modal test assertions for new sliders and persisted values**

```ts
const trafficCountInput = rendered.container.querySelector('input[aria-label="Cars in city"]') as HTMLInputElement;
const trafficSpeedInput = rendered.container.querySelector('input[aria-label="Cars speed"]') as HTMLInputElement;

expect(trafficCountInput).toBeDefined();
expect(trafficSpeedInput).toBeDefined();

// simulate changes
valueSetter?.call(trafficCountInput, '22');
valueSetter?.call(trafficSpeedInput, '1.7');

expect(raw || '').toContain('"trafficParticlesCount":22');
expect(raw || '').toContain('"trafficParticlesSpeed":1.7');
```

- [ ] **Step 4: Run modal test file and confirm failures**

Run: `pnpm vitest run src/nostr-overlay/components/MapSettingsModal.test.tsx`
Expected: FAIL because sliders are not yet rendered/persisted.

- [ ] **Step 5: Run both red suites together (no commit yet)**

Run: `pnpm vitest run src/nostr/ui-settings.test.ts src/nostr-overlay/components/MapSettingsModal.test.tsx`
Expected: FAIL.
Note: Do not commit in red state; first green commit happens in Task 2 after passing tests.

### Task 2: Implement settings storage and UI controls to pass tests

**Files:**
- Modify: `src/nostr/ui-settings.ts`
- Modify: `src/nostr-overlay/components/MapSettingsModal.tsx`
- Modify: `src/nostr/ui-settings.test.ts`
- Modify: `src/nostr-overlay/components/MapSettingsModal.test.tsx`

- [ ] **Step 1: Implement ui-settings schema/defaults/normalizers for traffic fields**

```ts
const DEFAULT_TRAFFIC_PARTICLES_COUNT = 12;
const DEFAULT_TRAFFIC_PARTICLES_SPEED = 1;

function normalizeTrafficParticlesCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TRAFFIC_PARTICLES_COUNT;
  return Math.max(0, Math.min(50, Math.round(value)));
}

function normalizeTrafficParticlesSpeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TRAFFIC_PARTICLES_SPEED;
  return Math.max(0.2, Math.min(3, Math.round(value * 10) / 10));
}
```

- [ ] **Step 2: Implement modal controls in UI tab**

```tsx
<label className="nostr-label" htmlFor="nostr-traffic-count">Cars in city</label>
<input id="nostr-traffic-count" type="range" min={0} max={50} step={1} aria-label="Cars in city" ... />

<label className="nostr-label" htmlFor="nostr-traffic-speed">Cars speed</label>
<input id="nostr-traffic-speed" type="range" min={0.2} max={3} step={0.1} aria-label="Cars speed" ... />
```

- [ ] **Step 3: Run targeted tests to verify passing behavior**

Run: `pnpm vitest run src/nostr/ui-settings.test.ts src/nostr-overlay/components/MapSettingsModal.test.tsx`
Expected: PASS.

- [ ] **Step 4: Run typecheck for settings/UI edits**

Run: `pnpm typecheck`
Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit settings/UI implementation**

```bash
git add src/nostr/ui-settings.ts src/nostr/ui-settings.test.ts src/nostr-overlay/components/MapSettingsModal.tsx src/nostr-overlay/components/MapSettingsModal.test.tsx
git commit -m "feat: add persisted traffic particle count and speed settings"
```

### Task 3: Add and implement bridge/app contract for traffic settings propagation

**Files:**
- Modify: `src/nostr-overlay/map-bridge.ts`
- Modify: `src/nostr-overlay/map-bridge.test.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing map-bridge delegation test for traffic methods**

```ts
bridge.setTrafficParticlesCount(18);
bridge.setTrafficParticlesSpeed(1.6);

expect(api.setTrafficParticlesCount).toHaveBeenCalledWith(18);
expect(api.setTrafficParticlesSpeed).toHaveBeenCalledWith(1.6);
```

- [ ] **Step 2: Write failing App tests for traffic settings on initial mount and after UI settings updates**

```ts
window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
  occupiedLabelsZoomLevel: 8,
  streetLabelsEnabled: true,
  streetLabelsZoomLevel: 10,
  trafficParticlesCount: 20,
  trafficParticlesSpeed: 1.4,
}));

expect((bridge.setTrafficParticlesCount as any)).toHaveBeenCalledWith(20);
expect((bridge.setTrafficParticlesSpeed as any)).toHaveBeenCalledWith(1.4);

// then simulate UI settings update path and assert re-propagation
expect((bridge.setTrafficParticlesCount as any)).toHaveBeenLastCalledWith(22);
expect((bridge.setTrafficParticlesSpeed as any)).toHaveBeenLastCalledWith(1.7);
```

- [ ] **Step 3: Run the two test files and confirm failures**

Run: `pnpm vitest run src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/App.test.tsx`
Expected: FAIL due to missing bridge methods and App wiring.

- [ ] **Step 4: Implement contracts and App propagation**

```ts
// map-bridge.ts
setTrafficParticlesCount?(count: number): void;
setTrafficParticlesSpeed?(speed: number): void;

setTrafficParticlesCount(count: number): void {
  mainApi.setTrafficParticlesCount?.(count);
}

setTrafficParticlesSpeed(speed: number): void {
  mainApi.setTrafficParticlesSpeed?.(speed);
}
```

```ts
// App.tsx effect
mapBridge.setTrafficParticlesCount(uiSettings.trafficParticlesCount);
mapBridge.setTrafficParticlesSpeed(uiSettings.trafficParticlesSpeed);
```

- [ ] **Step 5: Re-run tests and commit**

Run: `pnpm vitest run src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/App.test.tsx`
Expected: PASS.

```bash
git add src/nostr-overlay/map-bridge.ts src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/App.tsx src/nostr-overlay/App.test.tsx
git commit -m "feat: propagate traffic particle settings through overlay bridge"
```

## Chunk 2: Traffic Engine and Rendering Integration

### Task 4: Create failing unit tests for traffic simulation domain

**Files:**
- Create: `src/ts/ui/traffic_particles.test.ts`
- Test: `src/ts/ui/traffic_particles.test.ts`

- [ ] **Step 1: Add test for deterministic continuation on non-intersection curve vertices**

```ts
test('continues through degree-2 curve vertex without random branch', () => {
  const sim = createTrafficSimulationForFixture({ random: () => 0.99 });
  sim.step(0.5);
  expect(sim.debugCurrentNodeDegree(0)).toBe(2);
  expect(sim.debugParticleEdgePath(0)).toEqual(['a->b', 'b->c']);
});
```

- [ ] **Step 2: Add test for fully random intersection choice including reverse edge**

```ts
test('chooses uniformly from all connected outgoing edges at degree>=3 junction', () => {
  const sim = createTrafficSimulationForFixture({ random: seededRandom(123) });
  const picks = sampleJunctionChoices(sim, 200);
  expect(Object.keys(picks).sort()).toEqual(['toNorth', 'toSouth', 'toWest']);
  expect(picks.toSouth).toBeGreaterThan(0); // reverse edge included
});
```

- [ ] **Step 3: Add test for `count=0` disables simulation output**

```ts
const sim = createTrafficSimulationForFixture();
sim.setCount(0);
expect(sim.getParticleCount()).toBe(0);
expect(sim.step(0.016)).toEqual([]);
```

- [ ] **Step 4: Add test for out-of-bounds respawn via world-bounds helper**

```ts
const sim = createTrafficSimulationForFixture();
sim.forceParticleWorldPosition(new Vector(99999, 99999));
sim.step(0.016);
expect(sim.debugWasRespawned(0)).toBe(true);
```

- [ ] **Step 5: Add test for carry-over distance across edge transition in one frame**

```ts
const sim = createTrafficSimulationForFixture();
sim.forceParticleNearEdgeEnd(0, 0.95);
sim.step(0.5);
expect(sim.debugDistanceCarryOverApplied(0)).toBe(true);
```

- [ ] **Step 6: Run new test file and confirm failures**

Run: `pnpm vitest run src/ts/ui/traffic_particles.test.ts`
Expected: FAIL because simulation module and/or helper methods are not implemented yet.

- [ ] **Step 7: Commit failing tests for simulation module**

```bash
git add src/ts/ui/traffic_particles.test.ts
git commit -m "test: define traffic particle simulation behavior"
```

### Task 5: Implement traffic simulation module to satisfy domain tests

**Files:**
- Create: `src/ts/ui/traffic_particles.ts`
- Modify: `src/ts/ui/traffic_particles.test.ts`

- [ ] **Step 1: Implement public API and core types**

```ts
export interface TrafficSimulationOptions {
  random?: () => number;
  baseSpeed?: number;
}

export interface TrafficWorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class TrafficParticlesSimulation {
  setNetwork(polylines: Vector[][]): void;
  setCount(count: number): void;
  setSpeedMultiplier(speed: number): void;
  setWorldBounds(bounds: TrafficWorldBounds): void;
  step(deltaSeconds: number): Vector[];
}
```

- [ ] **Step 2: Implement node/edge build with degree metadata and continuity rules**

```ts
private chooseNextEdge(nodeId: number, incomingEdgeId: number): number | null {
  const node = this.nodes[nodeId];
  if (!node || node.outEdgeIds.length === 0) return null;

  if (node.degree >= 3) {
    const idx = Math.floor(this.random() * node.outEdgeIds.length);
    return node.outEdgeIds[idx];
  }

  return this.findGeometricContinuationEdge(nodeId, incomingEdgeId);
}
```

- [ ] **Step 3: Implement bounds check, respawn, and carry-over distance logic**

```ts
private isWithinWorldBounds(point: Vector): boolean {
  return point.x >= this.bounds.minX && point.x <= this.bounds.maxX
      && point.y >= this.bounds.minY && point.y <= this.bounds.maxY;
}
```

- [ ] **Step 4: Run simulation tests and fix edge cases until passing**

Run: `pnpm vitest run src/ts/ui/traffic_particles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit simulation module**

```bash
git add src/ts/ui/traffic_particles.ts src/ts/ui/traffic_particles.test.ts
git commit -m "feat: add street-following traffic particle simulation"
```

### Task 6: Integrate simulation into map runtime and rendering

**Files:**
- Create: `src/ts/ui/main_gui.traffic_particles.test.ts`
- Modify: `src/ts/ui/style-occupancy.test.ts`
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/ts/ui/style.ts`
- Modify: `src/main.ts`
- Modify: `src/nostr-overlay/map-bridge.ts`

- [ ] **Step 1: Add failing tests for runtime integration (deltaSeconds + world bounds forwarding)**

```ts
test('forwards DomainController runtime bounds (origin + worldDimensions) into traffic simulation', () => {
  // assert setWorldBounds({minX,minY,maxX,maxY}) receives origin/worldDimensions-derived values
});

test('Main.update clamps deltaSeconds to [0, 0.1] before MainGUI.update', () => {
  // assert clamp behavior on large frame gaps
});
```

- [ ] **Step 2: Add failing style test coverage for traffic particle drawing behavior**

```ts
test('draws traffic particle halos in DefaultStyle when particles exist', () => {
  style.trafficParticles = [{ center: new Vector(10, 10), radiusPx: 1.5, haloPx: 5, alpha: 0.25 }];
  style.draw();
  expect(fakeCanvas.drawCircle).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run integration/style tests and confirm initial failure**

Run: `pnpm vitest run src/ts/ui/main_gui.traffic_particles.test.ts src/ts/ui/style-occupancy.test.ts`
Expected: FAIL (missing traffic simulation integration and style support).

- [ ] **Step 4: Implement Main + MainGUI integration with deltaSeconds, world bounds mapping, and setters**

```ts
// main.ts
private lastFrameTime = performance.now();

update(): void {
  const now = performance.now();
  const deltaSeconds = Math.max(0, Math.min(0.1, (now - this.lastFrameTime) / 1000));
  this.lastFrameTime = now;
  this.mainGui.update(deltaSeconds);
  ...
}
```

```ts
// main_gui.ts
const origin = this.domainController.origin;
const world = this.domainController.worldDimensions;
this.trafficSimulation.setWorldBounds({
  minX: origin.x,
  minY: origin.y,
  maxX: origin.x + world.x,
  maxY: origin.y + world.y,
});

setTrafficParticlesCount(count: number): void { ... }
setTrafficParticlesSpeed(speed: number): void { ... }
update(deltaSeconds: number): void { ...traffic.step(deltaSeconds); ... }
```

- [ ] **Step 5: Implement Style rendering payload and drawing logic (Default + Rough style-safe path)**

```ts
public trafficParticles: Array<{ center: Vector; radiusPx: number; haloPx: number; alpha: number }> = [];

// DefaultStyle.draw
for (const p of this.trafficParticles) {
  canvas.setFillStyle(`rgba(255, 206, 120, ${p.alpha})`);
  canvas.drawCircle(p.center, p.haloPx);
  canvas.setFillStyle('rgba(255, 236, 180, 0.9)');
  canvas.drawCircle(p.center, p.radiusPx);
}
```

- [ ] **Step 6: Run targeted test suite and commit integration**

Run: `pnpm vitest run src/ts/ui/main_gui.traffic_particles.test.ts src/ts/ui/style-occupancy.test.ts src/ts/ui/traffic_particles.test.ts src/nostr-overlay/map-bridge.test.ts`
Expected: PASS.

```bash
git add src/main.ts src/ts/ui/main_gui.ts src/ts/ui/main_gui.traffic_particles.test.ts src/ts/ui/style.ts src/ts/ui/style-occupancy.test.ts src/nostr-overlay/map-bridge.ts
git commit -m "feat: wire traffic simulation to runtime bounds and render loop"
```

### Task 7: End-to-end verification before handoff

**Files:**
- Modify (if needed): `src/nostr-overlay/App.test.tsx`
- Modify (if needed): `src/nostr-overlay/components/MapSettingsModal.test.tsx`
- Modify (if needed): `src/nostr/ui-settings.test.ts`

- [ ] **Step 1: Run focused regression suite**

Run: `pnpm vitest run src/nostr/ui-settings.test.ts src/nostr-overlay/components/MapSettingsModal.test.tsx src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/App.test.tsx src/ts/ui/traffic_particles.test.ts src/ts/ui/style-occupancy.test.ts`
Expected: PASS.

- [ ] **Step 2: Run full unit tests**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Verify no animation library dependency was introduced**

Run: `rg '"(gsap|animejs|@tweenjs/tween\\.js)"' package.json pnpm-lock.yaml`
Expected: no matches.

- [ ] **Step 5: Optional smoke build verification**

Run: `pnpm build`
Expected: PASS and production bundle generated.

- [ ] **Step 6: Commit final polish/fixes**

```bash
git add -A
git commit -m "test: verify traffic particle feature integration"
```

## Completion Criteria

- Particle count slider exists in UI settings (`0..50`) and persists.
- Particle speed slider exists in UI settings (`0.2..3.0`) and persists.
- App applies both settings on load and on change through bridge methods.
- Simulation follows streets strictly, continues through non-intersection curve vertices, and only randomizes at real intersections.
- Intersection selection is fully random across all connected outgoing edges (including reverse if connected).
- Out-of-bounds particles respawn using world bounds from domain controller.
- No animation library added.
- All listed tests and verification commands pass.
