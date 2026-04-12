# Feed Route (HashRouter) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el feed de seguidos de dialog a vista enrutable (`/#/feed`) que sustituya la zona del mapa sin reconstruir el mapa al volver.

**Architecture:** Mantener el mapa fuera de React (canvas/svgs existentes) y mover la navegacion de feed al router del overlay con `HashRouter`. La UI del feed se renderiza como superficie fija sobre el area de mapa, mientras el panel lateral sigue activo. El estado del feed se mantiene con `useFollowingFeed` y se sincroniza con la ruta.

**Tech Stack:** React 19, React Router v7 (`react-router`), Vite, Vitest.

---

## Chunk 1: Routing Foundation

### Task 1: Introduce React Router in overlay mount + test harness

**Files:**
- Modify: `package.json`
- Modify: `src/nostr-overlay/bootstrap.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/selection-focus.test.tsx`

- [ ] **Step 1: Write failing route-centric test in App integration**
Add a test in `src/nostr-overlay/App.test.tsx` that renders with initial route `/feed` and expects feed surface UI.
- [ ] **Step 2: Run test to verify failure**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx -t "feed route"`
Expected: FAIL (no router context / no route behavior).
- [ ] **Step 3: Add router dependency + mount provider**
Add `react-router` dependency and wrap overlay render in `HashRouter` in `src/nostr-overlay/bootstrap.tsx`.
- [ ] **Step 4: Update test render helpers**
Wrap `renderApp(...)` helpers with `MemoryRouter` in `src/nostr-overlay/App.test.tsx` and `src/nostr-overlay/selection-focus.test.tsx`.
- [ ] **Step 5: Re-run targeted tests**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx src/nostr-overlay/selection-focus.test.tsx`
Expected: PASS in existing tests not tied to feed route behavior.
- [ ] **Step 6: Commit**
`git commit -m "build: add react-router foundation for overlay routes"`

---

## Chunk 2: Feed Surface UI (non-dialog)

### Task 2: Extract reusable feed content and add routed surface component

**Files:**
- Create: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Create: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedDialog.tsx`
- Create: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] **Step 1: Write failing surface component test**
In `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`, assert:
1) renders empty/feed states, 2) close button triggers `onClose`, 3) thread interactions still work.
- [ ] **Step 2: Run test to verify failure**
Run: `pnpm test:unit -- src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: FAIL (component missing).
- [ ] **Step 3: Implement shared content**
Move current feed body logic from `FollowingFeedDialog` into `FollowingFeedContent`.
- [ ] **Step 4: Implement surface wrapper**
Create `FollowingFeedSurface` with fixed full-map-area container (`left/width` based on `--nostr-map-inset-left`) and explicit "volver al mapa".
- [ ] **Step 5: Keep dialog wrapper functional**
Refactor `FollowingFeedDialog` to use `FollowingFeedContent` so existing behavior/tests remain valid.
- [ ] **Step 6: Add styles**
Add surface classes in `src/nostr-overlay/styles.css` with `pointer-events: auto`, proper z-index, responsive behavior.
- [ ] **Step 7: Re-run component tests**
Run: `pnpm test:unit -- src/nostr-overlay/components/FollowingFeedDialog.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: PASS.
- [ ] **Step 8: Commit**
`git commit -m "refactor: extract feed content and add routed feed surface"`

---

## Chunk 3: Route-driven behavior in App

### Task 3: Replace feed dialog flow with route flow

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing integration tests**
Add tests in `src/nostr-overlay/App.test.tsx`:
1) clicking feed button navigates to `/feed` and shows surface,
2) closing feed returns to `/`,
3) entering `/feed` triggers first feed load.
- [ ] **Step 2: Run tests to verify failure**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx -t "following feed route"`
Expected: FAIL.
- [ ] **Step 3: Implement route handling in App**
Use `useNavigate`, `useLocation`, and `Routes/Route/Navigate` in `src/nostr-overlay/App.tsx`:
- open feed => navigate `/feed`
- close feed => navigate `/`
- route `/feed` renders `FollowingFeedSurface`
- guard unknown routes to `/`
- sync store open/close with route (keep `useFollowingFeed` store).
- [ ] **Step 4: Hide map-only floating controls during feed route**
Conditionally hide `MapZoomControls` and `MapDisplayToggleControls` while route is `/feed`.
- [ ] **Step 5: Re-run tests**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx src/nostr-overlay/selection-focus.test.tsx`
Expected: PASS.
- [ ] **Step 6: Commit**
`git commit -m "feat: route following feed as map surface with hash navigation"`

---

## Chunk 4: Regression & Verification

### Task 4: Full verification and cleanup

**Files:**
- Modify (if needed): `src/nostr-overlay/App.test.tsx`
- Modify (if needed): `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [ ] **Step 1: Run focused unit suite**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx src/nostr-overlay/selection-focus.test.tsx src/nostr-overlay/components/FollowingFeedDialog.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- [ ] **Step 2: Run full unit tests**
Run: `pnpm test:unit`
- [ ] **Step 3: Run typecheck/build**
Run: `pnpm typecheck && pnpm build`
- [ ] **Step 4: Final commit (if any fixes)**
`git commit -m "test: cover feed route surface and routing regressions"`

---

**Notas de implementacion clave**
- Ruta acordada: `HashRouter` con `/#/feed`.
- El mapa no se reconstruye porque no se desmonta `map-canvas`/`map-svg` (`index.html`), solo cambia la capa React del overlay.
- Este patron deja preparado migrar mas dialogs a rutas (`/#/chat`, `/#/notifications`) sin cambiar la base.
