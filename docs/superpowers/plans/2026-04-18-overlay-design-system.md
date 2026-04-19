# Overlay Design System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce custom visual styling in the `nostr-overlay` and establish a more cohesive first-wave design system around existing `shadcn` primitives.

**Architecture:** Keep `src/nostr-overlay/styles.css` as the source of shared tokens and spatial/layout-specific rules, but move repeated visual decisions into reusable component variants and simpler Tailwind composition. This first wave only touches the shared surface language plus the two highest-impact overlay entry points: `OverlaySidebar` and `LoginGateScreen`.

**Tech Stack:** React 19, Vite, Tailwind v4, shadcn/ui (radix-nova), Vitest, TypeScript

---

## Implementation Scope

- In scope for this iteration:
  - shared overlay tokens and utilities in `src/nostr-overlay/styles.css`
  - visual variants in `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/input.tsx`, and optionally `src/components/ui/sidebar.tsx` if a variant is clearly reusable
  - `src/nostr-overlay/components/LoginGateScreen.tsx`
  - `src/nostr-overlay/components/LoginMethodSelector.tsx`
  - `src/nostr-overlay/components/OverlaySidebar.tsx`
  - targeted tests for the affected UI
- Out of scope for this iteration:
  - `FollowingFeedSurface` baseline timeout failure
  - chat detail surfaces
  - relays/search/settings screens beyond any shared pattern they inherit indirectly
  - landing page

## File Map

- Modify: `src/nostr-overlay/styles.css`
  - overlay visual tokens, shared panel rhythm, auth shell, sidebar action affordances
- Modify: `src/components/ui/button.tsx`
  - add one overlay-specific variant only if repeated classes disappear in multiple overlay files
- Modify: `src/components/ui/card.tsx`
  - add small surface distinctions only if they replace repeated local card styling
- Modify: `src/components/ui/input.tsx`
  - keep semantic default input, only expose a compact overlay-friendly appearance if needed by more than one auth form
- Modify: `src/nostr-overlay/components/LoginGateScreen.tsx`
  - replace custom shell classes where Tailwind + variants suffice, keep only structural hooks that tests still need
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
  - reduce bespoke auth action styling and align form rhythm with shared primitives
- Modify: `src/nostr-overlay/components/OverlaySidebar.tsx`
  - unify toolbar density, header polish, user menu polish, unread indicators
- Test: `src/nostr-overlay/components/LoginGateScreen.test.tsx`
  - update or add expectations for the new shell structure
- Create: `src/nostr-overlay/components/OverlaySidebar.test.tsx`
  - regression coverage for the shared sidebar surface language

## Chunk 1: Plan and Test Harness

### Task 1: Document Scope and Lock Regression Targets

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-overlay-design-system.md`
- Test: `src/nostr-overlay/components/LoginGateScreen.test.tsx`
- Create: `src/nostr-overlay/components/OverlaySidebar.test.tsx`

- [ ] **Step 1: Add the plan document**

Save this plan file and confirm the scope is limited to the first-wave refactor.

- [ ] **Step 2: Write a failing regression test for the sidebar surface language**

Cover at least:
- toolbar keeps a compact vertical rhythm
- platform header uses the refined shell spacing
- readonly user badge still renders without custom ad-hoc styling hooks

- [ ] **Step 3: Run the targeted tests to verify red**

Run: `pnpm --dir .worktrees/overlay-design-system test:unit:frontend -- src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/OverlaySidebar.test.tsx`

Expected:
- at least the new sidebar test fails before implementation

## Chunk 2: Shared Overlay Surface Language

### Task 2: Introduce Shared Overlay Tokens and Minimal Primitive Variants

**Files:**
- Modify: `src/nostr-overlay/styles.css`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/input.tsx`

- [ ] **Step 1: Identify repeated visual rules to absorb into shared styles**

Target only rules reused by both auth shell and sidebar:
- compact action density
- subtle elevated surface treatment
- muted secondary action affordance
- stable unread/status dot treatment

- [ ] **Step 2: Implement the minimal shared styling surface**

Prefer:
- semantic tokens in `styles.css`
- one reusable variant in `Button` if it removes repeated local classes
- one reusable surface refinement in `Card` if it removes repeated local classes

Do not add feature-specific variants tied only to one component.

- [ ] **Step 3: Keep spatial rules separate from visual rules**

Retain only map/overlay positioning and structural auth shell layout in CSS. Remove or shrink purely visual `.nostr-*` rules that now duplicate primitive styling.

- [ ] **Step 4: Run targeted tests to verify green**

Run: `pnpm --dir .worktrees/overlay-design-system test:unit:frontend -- src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/OverlaySidebar.test.tsx`

Expected:
- targeted tests pass

## Chunk 3: Auth Shell Refactor

### Task 3: Refine `LoginGateScreen` and `LoginMethodSelector`

**Files:**
- Modify: `src/nostr-overlay/components/LoginGateScreen.tsx`
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Modify: `src/nostr-overlay/components/LoginGateScreen.test.tsx`
- Optionally modify: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`

- [ ] **Step 1: Update tests first for the new auth shell contract**

Cover:
- shell card remains a single composed card
- actions stay grouped in the main login view
- footer navigation placement remains stable
- auth actions use shared primitives instead of bespoke visual wrappers where possible

- [ ] **Step 2: Implement the minimal auth shell refactor**

Rules:
- preserve behavior and test hooks that are still useful
- remove custom visual wrappers when `Card`, `Button`, `Input`, and Tailwind layout are sufficient
- keep only the CSS hooks needed for layout/cover/loading shell

- [ ] **Step 3: Run auth-focused tests**

Run: `pnpm --dir .worktrees/overlay-design-system test:unit:frontend -- src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx`

Expected:
- auth-focused tests pass

## Chunk 4: Sidebar Refactor

### Task 4: Refine `OverlaySidebar`

**Files:**
- Modify: `src/nostr-overlay/components/OverlaySidebar.tsx`
- Create: `src/nostr-overlay/components/OverlaySidebar.test.tsx`
- Optionally modify: `src/components/ui/sidebar.tsx`

- [ ] **Step 1: Write failing sidebar tests for the new shared shell**

Cover:
- compact action group classes are replaced by shared structure where possible
- header and footer composition still render correctly
- route badges and unread indicators still appear in the correct places

- [ ] **Step 2: Implement the sidebar refactor**

Focus on:
- cleaner header spacing
- more consistent menu density
- fewer bespoke button classes
- keeping unread indicators and badges intact

- [ ] **Step 3: Run sidebar-focused tests**

Run: `pnpm --dir .worktrees/overlay-design-system test:unit:frontend -- src/nostr-overlay/components/OverlaySidebar.test.tsx`

Expected:
- sidebar tests pass

## Chunk 5: Validation

### Task 5: Verify the First Wave End-to-End

**Files:**
- Modify: any of the files above only if verification reveals regressions

- [ ] **Step 1: Run the targeted first-wave suite**

Run: `pnpm --dir .worktrees/overlay-design-system test:unit:frontend -- src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/components/OverlaySidebar.test.tsx`

Expected:
- all targeted tests pass

- [ ] **Step 2: Run frontend lint**

Run: `pnpm --dir .worktrees/overlay-design-system lint:frontend`

Expected:
- exit code 0

- [ ] **Step 3: Run frontend typecheck**

Run: `pnpm --dir .worktrees/overlay-design-system typecheck:frontend`

Expected:
- exit code 0

- [ ] **Step 4: Run a broader frontend unit suite with known baseline caveat noted**

Run: `pnpm --dir .worktrees/overlay-design-system test:unit:frontend`

Expected:
- either the same known baseline timeout in `FollowingFeedSurface.test.tsx` and no new failures, or a fully green run if the baseline issue no longer reproduces

- [ ] **Step 5: Record review and next-wave candidates**

Document follow-up candidates after implementation:
- profile dialog
- settings shells
- notifications/feed/search list rows
- map floating controls

## Verification Notes

- Baseline known issue before this work started:
  - `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - test: `opens per-post media lightbox when clicking an image`
  - failure mode: timeout at 5000ms
- Do not claim full frontend green unless the fresh verification command proves that baseline issue is gone.

## Success Criteria

- `LoginGateScreen` and `OverlaySidebar` use fewer bespoke visual classes
- shared primitives absorb repeated surface styling without bloating APIs
- `src/nostr-overlay/styles.css` loses visual duplication in the auth/sidebar area while keeping structural layout rules
- targeted tests, lint, and typecheck pass
