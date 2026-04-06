# Big Bang Migration Checklist (Vite + pnpm)

## Baseline (pre-migration)

Date: 2026-04-06
Branch: `chore/vite-pnpm-big-bang`

### Baseline command run

- `npm install && timeout 45s npx gulp || true`

### Baseline result

- Legacy build start: PASS
- Legacy build complete: FAIL
- Observed error: `Cannot find module '../Vector'` from `src/ts/ui/drag_controller.ts`

Notes:
- The current branch starts from a state where legacy build is already broken on Linux case-sensitive paths.
- Migration acceptance will be measured against functional behavior goals below (map runtime + exports), not against this broken legacy pipeline.

## Acceptance Criteria (post-migration)

- [ ] `pnpm install` completes and lockfile is present
- [ ] `pnpm dev` starts Vite and app loads
- [ ] `pnpm build` generates production output in `dist/`
- [ ] `pnpm preview` serves production output correctly
- [ ] Smoke test validates map surface (`#map-canvas`, `#map-svg`, GUI panel)
- [ ] Smoke test triggers Generate action without fatal console errors
- [ ] Manual check: PNG export works
- [ ] Manual check: SVG export works
- [ ] Manual check: STL export works
- [ ] Legacy toolchain artifacts removed (`gulpfile.js`, Browserify/Gulp deps/scripts)

## Verification Log

- [x] Chunk 1 complete
- [x] Chunk 2 complete
- [x] Chunk 3 complete
- [x] Chunk 4 complete
- [ ] Chunk 5 complete
- [ ] Chunk 6 complete
- [ ] Chunk 7 complete
- [ ] Chunk 8 complete
