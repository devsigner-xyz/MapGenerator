# MapGenerator Performance Improvements Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. Update this file as you complete work by switching each step/task to `- [x]`.

**Goal:** Reduce initial load cost and improve runtime responsiveness (pan/zoom/hover/overlay) without changing product behavior.

**Architecture:** Execute in independent phases with one commit per phase. Prioritize highest-impact bottlenecks first (bundle size, per-frame work, hit testing), then tighten overlay and scheduling costs. Keep behavior equivalent and validate each phase with focused tests plus a build.

**Tech Stack:** TypeScript, Vite, React 19, Canvas 2D, Nostr NDK, Vitest, Playwright.

---

## Execution Constraints (User Requirements)

- [x] Work from a branch created off `master` (do not implement directly on `master`).
- [x] Do not use worktrees.
- [x] No PR flow for this effort; create commits locally per phase.
- [ ] Create exactly one main commit per phase (plus optional tiny fixup commit only if phase verification fails).
- [ ] Mark tasks/steps as completed in this file while advancing.

## Baseline Commands (run before and after each phase)

- [x] `pnpm build`
- [x] `pnpm test`
- [x] Record bundle artifacts: `dist/assets/*.js`, `dist/assets/*.css` sizes

---

### Phase 0: Baseline and Guardrails

**Phase Goal (context):** Establish measurable baseline metrics and a stable verification ritual before optimizations.

**Files:**
- Create: `plans/perf-baseline-2026-04-09.md`
- Modify: `plans/2026-04-09-performance-improvements-plan.md`

- [x] **Step 1: Capture current performance baseline**
  - Record: initial JS size, CSS size, build time, and basic runtime observations (idle CPU, pan smoothness, hover response).

- [x] **Step 2: Define acceptance thresholds per phase**
  - Add pass/fail thresholds for bundle split, frame-time reduction, and hover hit-test cost.

- [x] **Step 3: Verify project health pre-work**
  - Run: `pnpm test`
  - Run: `pnpm build`
  - Expected: both pass.

- [x] **Step 4: Commit Phase 0**
  - Commit message: `chore(perf): capture baseline and verification thresholds`

---

### Phase 1: Bundle Size and Initial Load

**Phase Goal (context):** Reduce initial payload by deferring heavy modules to on-demand loading.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr/ndk-client.ts` (if needed for lazy factory support)
- Modify: `src/ts/ui/style.ts`
- Modify: `vite.config.mts`
- Modify: `plans/2026-04-09-performance-improvements-plan.md`

- [ ] **Step 1: Lazy-load STL stack**
  - Move `ModelGenerator` loading to dynamic import inside STL export path.
  - Keep same user-facing behavior for `downloadSTL()`.

- [ ] **Step 2: Lazy-load Nostr overlay bootstrap**
  - Defer overlay bootstrap import from startup path to dynamic load.
  - Ensure overlay still mounts after main app initialization.

- [ ] **Step 3: Defer NDK-heavy path where safe**
  - Load NDK client implementation only when Nostr submission flow starts.
  - Preserve existing service API contracts in `useNostrOverlay`.

- [ ] **Step 4: Configure Vite chunk splitting**
  - Add `manualChunks` strategy for `nostr`, `three/stl`, and overlay/UI bundles.

- [ ] **Step 5: Remove dead imports**
  - Remove unused `dat.gui` import from `src/ts/ui/style.ts`.

- [ ] **Step 6: Verify and measure**
  - Run: `pnpm test`
  - Run: `pnpm build`
  - Compare bundle sizes against Phase 0 baseline.

- [ ] **Step 7: Commit Phase 1**
  - Commit message: `perf(bundle): defer heavy modules and split runtime chunks`

---

### Phase 2: Projection and Draw-Prep Caching

**Phase Goal (context):** Remove repeated world-to-screen transformations and array reconstruction from hot render paths.

**Files:**
- Modify: `src/ts/ui/domain_controller.ts`
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/ts/ui/road_gui.ts`
- Modify: `src/ts/ui/water_gui.ts`
- Modify: `src/ts/ui/buildings.ts`
- Modify: `plans/2026-04-09-performance-improvements-plan.md`

- [ ] **Step 1: Add view revision/invalidation signal**
  - Introduce monotonic view revision in `DomainController` bumped on pan/zoom/resize/inset/camera changes.

- [ ] **Step 2: Cache projected roads/water/lots/models**
  - Recompute only when geometry changed or view revision changed.

- [ ] **Step 3: Update `MainGUI.draw` to consume cached projections**
  - Avoid rebuilding screen arrays every frame.

- [ ] **Step 4: Keep cache invalidation explicit**
  - Invalidate caches on map regeneration, park changes, building changes, and occupancy-affecting state.

- [ ] **Step 5: Verify and measure**
  - Run: `pnpm test`
  - Run: `pnpm build`
  - Validate lower scripting time during pan/zoom in manual check.

- [ ] **Step 6: Commit Phase 2**
  - Commit message: `perf(render): cache projected geometry by view revision`

---

### Phase 3: Street Labels and Occupied Building Hit-Testing

**Phase Goal (context):** Reduce CPU spikes from label generation and mousemove hit detection.

**Files:**
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/ts/ui/street_labels.ts`
- Modify: `src/ts/ui/occupied_building_hit.ts`
- Modify: `src/main.ts`
- Add: `src/ts/ui/occupied_building_spatial_index.ts` (if needed)
- Modify: `plans/2026-04-09-performance-improvements-plan.md`

- [ ] **Step 1: Introduce street-label cache keying**
  - Cache labels by deterministic key (`seed`, zoom bucket, geometry/version tokens, usernames hash).

- [ ] **Step 2: Recompute labels only on cache miss**
  - Keep label output deterministic and equivalent in rendering intent.

- [ ] **Step 3: Add occupied-building spatial index**
  - Build quadtree/grid index for occupied footprint candidates.
  - Narrow hit-test to nearby candidates, then polygon test.

- [ ] **Step 4: Integrate index lifecycle**
  - Rebuild index only when occupancy map or building footprints change.

- [ ] **Step 5: Verify and measure**
  - Run: `pnpm test`
  - Run: `pnpm build`
  - Manual check: hover remains accurate and smoother on dense maps.

- [ ] **Step 6: Commit Phase 3**
  - Commit message: `perf(interaction): cache labels and accelerate occupied hit-testing`

---

### Phase 4: React Overlay Hot Path Tightening

**Phase Goal (context):** Cut avoidable React/DOM work in presence and people list rendering.

**Files:**
- Modify: `src/nostr-overlay/components/MapPresenceLayer.tsx`
- Modify: `src/nostr-overlay/domain/presence-layer-model.ts`
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`
- Modify: `src/nostr-overlay/components/SocialSidebar.tsx` (if memo boundaries needed)
- Modify: `plans/2026-04-09-performance-improvements-plan.md`

- [ ] **Step 1: Reduce recomputation in presence model**
  - Avoid full sort/rebuild unless occupancy or relevant visibility inputs changed.

- [ ] **Step 2: Make tag repositioning cheaper**
  - Prefer transform-based movement (`translate3d`) where practical.

- [ ] **Step 3: Avoid unnecessary virtualizer setup**
  - Create virtualizer only when threshold is exceeded.

- [ ] **Step 4: Verify and measure**
  - Run: `pnpm test`
  - Run: `pnpm build`
  - Manual check with follower-heavy state.

- [ ] **Step 5: Commit Phase 4**
  - Commit message: `perf(overlay): reduce presence and people-list render overhead`

---

### Phase 5: Main Loop Scheduling and Idle Efficiency

**Phase Goal (context):** Minimize idle CPU and per-frame overhead while preserving active animations.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/ts/ui/style.ts` (if update signaling needs adjustment)
- Modify: `plans/2026-04-09-performance-improvements-plan.md`

- [ ] **Step 1: Stabilize RAF callback**
  - Replace per-frame `.bind(this)` with stable callback reference.

- [ ] **Step 2: Tighten dirty-check gates**
  - Skip heavy update/draw blocks when no visual state changed and no animation is active.

- [ ] **Step 3: Keep animation correctness**
  - Ensure traffic/build/export flows still tick correctly under new gates.

- [ ] **Step 4: Verify and final measurement**
  - Run: `pnpm test`
  - Run: `pnpm build`
  - Compare against Phase 0 baseline and document results.

- [ ] **Step 5: Commit Phase 5**
  - Commit message: `perf(loop): reduce idle frame work and scheduling overhead`

---

## Finalization Checklist

- [ ] Update this plan with completed checkboxes for all executed steps.
- [ ] Produce final summary file: `plans/perf-results-2026-04-09.md` with before/after metrics.
- [ ] Confirm each phase has its own commit in history.
- [ ] Confirm current branch is not `master`.
