# Performance Baseline - 2026-04-09

## Environment

- Branch: `perf/phase-0-1-performance`
- Node package manager: `pnpm`
- Build tool: `vite 8.0.7`

## Baseline Measurements

### Test Health

- Command: `pnpm test`
- Result: PASS
- Test files: 36 passed
- Tests: 144 passed
- Reported duration: 3.48s

### Build Health

- Command: `pnpm build`
- Result: PASS
- Reported build duration: 1.27s (`BUILD_SECONDS=1.27`)
- Notable warning: chunk larger than 500 kB after minification

### Bundle Artifacts

- `dist/assets/index-BS7EQowK.js`: 3,667.56 kB (gzip 927.76 kB)
- `dist/assets/index-BOb06EK1.css`: 72.14 kB (gzip 12.97 kB)

### Runtime Baseline Notes

- This CLI environment does not provide reliable frame-time profiling for interactive pan/zoom/hover.
- Runtime targets are still defined below and will be verified manually in browser plus with bundle/runtime heuristics.

## Acceptance Thresholds by Phase

### Phase 1 (Bundle and Initial Load)

- JS initial payload reduction target: at least 25% vs baseline JS chunk size.
- Success condition: main entry chunk decreases and heavy modules are split into deferred chunks.

### Phase 2 (Projection/Draw Caching)

- Success condition: no full world-to-screen recompute in steady-state frames when view and geometry are unchanged.
- Target: measurable drop in scripting time during pan/zoom checks.

### Phase 3 (Labels and Hit Testing)

- Success condition: label generation uses cache on repeated draws.
- Success condition: occupied building hit-testing uses indexed candidate narrowing.

### Phase 4 (Overlay React Hot Path)

- Success condition: reduced recomputation in presence/list rendering paths, with behavior unchanged.

### Phase 5 (Main Loop Scheduling)

- Success condition: lower idle CPU work by avoiding unnecessary per-frame operations.

## Verification Ritual (per phase)

1. Run `pnpm test`.
2. Run `pnpm build`.
3. Record resulting `dist/assets/*.js` and `dist/assets/*.css` sizes.
4. Confirm no behavior regressions for touched flows.
