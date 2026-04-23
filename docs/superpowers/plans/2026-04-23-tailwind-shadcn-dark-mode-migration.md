# Tailwind/Shadcn Dark Mode Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace overlay hardcoded light-mode styling with Tailwind v4 semantic theming and shadcn primitives so dark mode renders consistently across audited pages and meets WCAG AA contrast expectations.

**Architecture:** Keep the theme source of truth in `src/nostr-overlay/styles.css` using Tailwind v4 CSS variables (`:root`, `.dark`, `@theme inline`) and stop encoding page colors in legacy selectors. Move page surfaces and list items to React/shadcn composition styled with existing semantic utilities (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) and introduce at most one overlay-specific surface token only if opacity/backdrop cannot be expressed cleanly with the existing palette. Leave custom CSS only for map/layout concerns that utilities do not express cleanly. Use Playwright smoke coverage with the provided readonly `npub` to prevent regressions on `wallet`, `estadisticas`, `relays`, `relay-detail`, and `descubre`.

**Tech Stack:** React 19, Vite, Tailwind CSS v4.2, shadcn/ui radix-nova, Recharts, Vitest, Playwright, sonner.

---

## File Structure

- **Create:** `src/nostr-overlay/components/OverlaySurface.tsx`
  - Shared routed overlay wrapper using Tailwind/shadcn semantic classes instead of legacy surface CSS.
- **Create:** `tests/smoke/helpers/overlay-session.ts`
  - Shared Playwright helper for seeding the readonly `npub` session and `theme=dark` without placeholder values in every test.
- **Modify:** `app/index.html`
  - Remove the inline body background that currently overrides theme colors.
- **Modify:** `src/nostr-overlay/styles.css`
  - Keep Tailwind v4 tokens and layout-only selectors; remove hardcoded light-mode backgrounds, borders, and text colors from routed pages and list items.
- **Modify:** `src/nostr-overlay/components/WalletPage.tsx`
  - Consume the new shared surface wrapper; keep Card-based layout fully semantic.
- **Modify:** `src/nostr-overlay/components/CityStatsPage.tsx`
  - Replace KPI/chart legacy classes with `Card` composition and tokenized chart colors.
- **Modify:** `src/nostr-overlay/components/DiscoverPage.tsx`
  - Replace legacy mission-row styling with semantic shadcn/Tailwind composition.
- **Modify:** `src/nostr-overlay/components/RelaysRoute.tsx`
- **Modify:** `src/nostr-overlay/components/RelayDetailRoute.tsx`
- **Modify:** `src/nostr-overlay/components/NotificationsPage.tsx`
- **Modify:** `src/nostr-overlay/components/UserSearchPage.tsx`
- **Modify:** `src/nostr-overlay/components/ChatsPage.tsx`
- **Modify:** `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- **Modify:** `src/nostr-overlay/components/settings-routes/OverlaySettingsLayout.tsx`
  - Migrate all routed overlay shells to the shared wrapper.
- **Modify:** `src/nostr-overlay/components/PeopleListTab.tsx`
  - Move person-card visual states into `Item`/Tailwind classes and delete legacy color overrides.
- **Modify:** `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
  - Only if needed after surface migration; keep relays on `Card`, `Table`, `Badge`, `InputGroup`, and utility classes rather than selector-driven color CSS.
- **Modify:** `src/nostr-overlay/components/WalletPage.test.tsx`
- **Modify:** `src/nostr-overlay/components/CityStatsPage.test.tsx`
- **Modify:** `src/nostr-overlay/components/DiscoverPage.test.tsx`
- **Modify:** `src/nostr-overlay/components/RelaysRoute.test.tsx`
- **Modify:** `src/nostr-overlay/components/RelayDetailRoute.test.tsx`
- **Modify:** `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- **Modify:** `src/nostr-overlay/components/PeopleListTab.test.tsx`
- **Modify:** `src/nostr-overlay/components/settings-routes/OverlaySettingsRoutes.test.tsx`
  - Update these existing tests anywhere they assert legacy wrapper classes or hardcoded surface styles.
- **Create:** `tests/smoke/app-dark-mode.spec.ts`
  - Playwright regression coverage for readonly `npub` + `theme=dark` across audited pages.
- **Modify:** `playwright.config.ts`
  - Only if needed to add tags, snapshots path, or per-test timeout for the new audit.

## Chunk 1: Theme Foundation & Shared Surfaces

### Task 1: Add a reliable dark-mode regression harness

**Files:**
- Modify: `app/index.html`
- Create: `tests/smoke/helpers/overlay-session.ts`
- Create: `tests/smoke/app-dark-mode.spec.ts`
- Test: `tests/smoke/app-dark-mode.spec.ts`

- [ ] **Step 1: Write the failing smoke test**

```ts
import { expect, test } from '@playwright/test'
import { seedReadonlyDarkSession, visibleSurfaceLuminance } from './helpers/overlay-session'

test('dark mode does not leave routed surfaces in light mode', async ({ page }) => {
  await seedReadonlyDarkSession(page)

  for (const route of ['/app/#/wallet', '/app/#/estadisticas', '/app/#/relays', '/app/#/relays/detail?url=wss%3A%2F%2Frelay.damus.io&source=configured&type=nip65Both', '/app/#/descubre']) {
    await page.goto(route)
    const surface = page.getByTestId('overlay-surface-content')
    await expect(surface).toBeVisible()
    expect(await visibleSurfaceLuminance(surface)).toBeLessThan(0.35)
  }
})
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: FAIL on one or more pages because routed surfaces still report a high luminance/light background.

- [ ] **Step 3: Add the reusable readonly-session helper and remove the theme-blocking inline body background**

Create `tests/smoke/helpers/overlay-session.ts` with the real readonly `npub` seed logic and a luminance helper, then remove the inline background from `app/index.html`.

```html
<!-- app/index.html -->
<body>
  <svg id="map-svg"></svg>
  <div>
    <canvas id="map-canvas"></canvas>
    <canvas id="img-canvas"></canvas>
  </div>
  <div id="nostr-overlay-root"></div>
</body>
```

- [ ] **Step 4: Re-run the smoke test**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: still FAIL on routed surfaces, but no longer because of the fixed grey body background. The test now isolates the actual routed-surface bug.

- [ ] **Step 5: Commit**

```bash
git add app/index.html tests/smoke/app-dark-mode.spec.ts
git commit -m "test: add dark mode smoke harness"
```

### Task 2: Move routed overlay shells to Tailwind semantic surfaces

**Files:**
- Create: `src/nostr-overlay/components/OverlaySurface.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Modify: `src/nostr-overlay/components/WalletPage.tsx`
- Modify: `src/nostr-overlay/components/CityStatsPage.tsx`
- Modify: `src/nostr-overlay/components/DiscoverPage.tsx`
- Modify: `src/nostr-overlay/components/RelaysRoute.tsx`
- Modify: `src/nostr-overlay/components/RelayDetailRoute.tsx`
- Modify: `src/nostr-overlay/components/NotificationsPage.tsx`
- Modify: `src/nostr-overlay/components/UserSearchPage.tsx`
- Modify: `src/nostr-overlay/components/ChatsPage.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Modify: `src/nostr-overlay/components/settings-routes/OverlaySettingsLayout.tsx`
- Modify: `src/nostr-overlay/components/WalletPage.test.tsx`
- Modify: `src/nostr-overlay/components/CityStatsPage.test.tsx`
- Modify: `src/nostr-overlay/components/DiscoverPage.test.tsx`
- Modify: `src/nostr-overlay/components/RelaysRoute.test.tsx`
- Modify: `src/nostr-overlay/components/RelayDetailRoute.test.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Modify: `src/nostr-overlay/components/settings-routes/OverlaySettingsRoutes.test.tsx`
- Test: `tests/smoke/app-dark-mode.spec.ts`

- [ ] **Step 1: Write the failing routed-surface assertions**

Extend the smoke test so it also checks that the shared routed surface uses a semantic test id and that dark mode is active:

```ts
const htmlHasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
expect(htmlHasDark).toBe(true)
await expect(page.getByTestId('overlay-surface-content')).toBeVisible()
```

- [ ] **Step 2: Run the test to verify it fails on the current routed wrappers**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: FAIL because existing pages still render `.nostr-routed-surface*` with light backgrounds defined in CSS.

- [ ] **Step 3: Add overlay-specific semantic tokens to the Tailwind theme**

In `src/nostr-overlay/styles.css`, extend the existing Tailwind v4 token system conservatively. Do not duplicate `foreground`, `border`, or `muted-foreground` unless execution proves the existing tokens are insufficient.

```css
@theme inline {
  --color-overlay-surface: var(--overlay-surface);
}

:root {
  --overlay-surface: color-mix(in oklab, var(--background) 86%, transparent);
}

.dark {
  --overlay-surface: color-mix(in oklab, var(--background) 88%, transparent);
}
```

- [ ] **Step 4: Create the shared wrapper and migrate all routed shells to it**

```tsx
// src/nostr-overlay/components/OverlaySurface.tsx
export function OverlaySurface({ ariaLabel, children }: { ariaLabel: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={ariaLabel}
      className="fixed top-0 left-[var(--nostr-map-inset-left)] z-[9] h-full w-[calc(100%-var(--nostr-map-inset-left))] bg-background/95 max-[720px]:left-0 max-[720px]:w-screen"
    >
      <div
        data-testid="overlay-surface-content"
        className="flex h-full flex-col gap-2.5 bg-overlay-surface p-3 text-foreground backdrop-blur-sm"
      >
        {children}
      </div>
    </section>
  )
}
```

Then replace per-page `nostr-routed-surface` / `nostr-routed-surface-content` shells with `OverlaySurface` and utility classes. Keep custom CSS only for layout pieces that truly need it (for example, non-color overflow rules or map-specific sizing).

- [ ] **Step 5: Remove or neutralize legacy routed-surface color selectors**

Delete or reduce these selectors to layout-only rules in `src/nostr-overlay/styles.css`:

```css
.nostr-routed-surface { /* keep only non-color layout if still needed */ }
.nostr-routed-surface-content { /* remove background */ }
.nostr-following-feed-surface { /* remove light gradient */ }
```

- [ ] **Step 6: Re-run the smoke test**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: wallet/relays/discover surface-level assertions PASS, while sidebar person cards and stats cards may still fail until later tasks.

- [ ] **Step 7: Commit**

```bash
git add src/nostr-overlay/components/OverlaySurface.tsx src/nostr-overlay/styles.css src/nostr-overlay/components/WalletPage.tsx src/nostr-overlay/components/CityStatsPage.tsx src/nostr-overlay/components/DiscoverPage.tsx src/nostr-overlay/components/RelaysRoute.tsx src/nostr-overlay/components/RelayDetailRoute.tsx src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/UserSearchPage.tsx src/nostr-overlay/components/ChatsPage.tsx src/nostr-overlay/components/FollowingFeedSurface.tsx src/nostr-overlay/components/settings-routes/OverlaySettingsLayout.tsx src/nostr-overlay/components/WalletPage.test.tsx src/nostr-overlay/components/CityStatsPage.test.tsx src/nostr-overlay/components/DiscoverPage.test.tsx src/nostr-overlay/components/RelaysRoute.test.tsx src/nostr-overlay/components/RelayDetailRoute.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/settings-routes/OverlaySettingsRoutes.test.tsx tests/smoke/helpers/overlay-session.ts tests/smoke/app-dark-mode.spec.ts
git commit -m "refactor: move routed overlay surfaces to semantic theme tokens"
```

## Chunk 2: Legacy Page Migration & Accessibility Verification

### Task 3: Migrate the sidebar people list to shadcn/Tailwind states

**Files:**
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Modify: `src/nostr-overlay/components/PeopleListTab.test.tsx`
- Test: `tests/smoke/app-dark-mode.spec.ts`

- [ ] **Step 1: Write the failing sidebar assertions**

Add a `descubre`-specific smoke assertion that verifies person cards are not rendered with near-white backgrounds in dark mode.

```ts
const firstPersonCard = page.locator('[data-slot="item"]').first()
const personBg = await firstPersonCard.evaluate((node) => getComputedStyle(node).backgroundColor)
expect(personBg).not.toContain('251, 253, 255')
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: FAIL on `descubre` because `.nostr-people-list [data-slot="item"]` still uses a hardcoded light background.

- [ ] **Step 3: Move visual states into `PeopleListTab.tsx` and shadcn primitives**

Update `Item` usage so background, hover, active, and focus come from utilities and semantic tokens:

```tsx
<Item
  variant="outline"
  size="sm"
  data-active={active ? 'true' : 'false'}
  className={cn(
    'bg-card/90 text-card-foreground transition-colors',
    'hover:bg-muted/70 data-[active=true]:bg-muted',
    'focus-within:ring-[3px] focus-within:ring-ring/50',
    selectable && 'cursor-pointer'
  )}
>
```

Also ensure the nested button keeps accessible focus styles and no `outline-none` without replacement.

- [ ] **Step 4: Delete the legacy item color overrides**

Remove these hardcoded selectors from `src/nostr-overlay/styles.css`:

```css
.nostr-people-list [data-slot="item"]
.nostr-people-list [data-slot="item"]:hover
.nostr-people-list [data-slot="item"][data-active="true"]
```

- [ ] **Step 5: Re-run the smoke test**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: PASS for sidebar person-card backgrounds in `descubre` and any other page showing the people list.

- [ ] **Step 6: Commit**

```bash
git add src/nostr-overlay/components/PeopleListTab.tsx src/nostr-overlay/styles.css tests/smoke/app-dark-mode.spec.ts
git commit -m "refactor: move people list dark mode to semantic item classes"
```

### Task 4: Replace stats cards and chart containers with semantic Card composition

**Files:**
- Modify: `src/nostr-overlay/components/CityStatsPage.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Modify: `src/nostr-overlay/components/CityStatsPage.test.tsx`
- Test: `tests/smoke/app-dark-mode.spec.ts`

- [ ] **Step 1: Write the failing stats assertions**

Extend the smoke test so `estadisticas` checks KPI cards and chart shells:

```ts
const kpiCard = page.locator('[data-testid="city-stats-kpi-card"]').first()
const chartCard = page.locator('[data-testid="city-stats-chart-card"]').first()
expect(await kpiCard.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toContain('251, 253, 255')
expect(await chartCard.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toContain('251, 253, 255')
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: FAIL on `estadisticas` because `.nostr-city-kpi-card` and `.nostr-city-chart` still force light backgrounds.

- [ ] **Step 3: Replace legacy KPI markup with `Card` composition and utilities**

```tsx
<Card data-testid="city-stats-kpi-card" className="gap-2 border-border/70 bg-card/95 text-card-foreground py-3">
  <CardContent className="grid gap-1 px-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <strong className="text-2xl font-semibold text-foreground">{value}</strong>
  </CardContent>
</Card>
```

- [ ] **Step 4: Replace chart shells and tokenise chart colors**

Use `Card` for chart containers and replace raw hex chart fills with theme variables:

```tsx
const housingData = [
  { name: t('cityStats.housing.occupied'), value: stats.housing.occupied, color: 'var(--chart-2)' },
  { name: t('cityStats.housing.available'), value: stats.housing.available, color: 'var(--chart-1)' },
]

<Card data-testid="city-stats-chart-card" className="border-border/70 bg-card/95">
  <CardContent className="px-3 py-3">
    <ResponsiveContainer>{/* ... */}</ResponsiveContainer>
  </CardContent>
</Card>
```

Also ensure axis/tooltip text uses colors that remain readable in dark mode.

- [ ] **Step 5: Delete the obsolete stats-specific hardcoded color selectors**

Remove or reduce these selectors in `src/nostr-overlay/styles.css`:

```css
.nostr-city-kpi-card
.nostr-city-kpi-card p
.nostr-city-kpi-card strong
.nostr-city-chart
```

- [ ] **Step 6: Re-run the smoke test**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: PASS for `estadisticas` dark-mode surface checks.

- [ ] **Step 7: Commit**

```bash
git add src/nostr-overlay/components/CityStatsPage.tsx src/nostr-overlay/styles.css tests/smoke/app-dark-mode.spec.ts
git commit -m "refactor: migrate city stats cards and charts to semantic theme"
```

### Task 5: Sweep remaining audited legacy selectors and tighten accessibility

**Files:**
- Modify: `src/nostr-overlay/components/DiscoverPage.tsx`
- Modify: `src/nostr-overlay/components/RelaysRoute.tsx`
- Modify: `src/nostr-overlay/components/RelayDetailRoute.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Modify: `src/nostr-overlay/components/DiscoverPage.test.tsx`
- Modify: `src/nostr-overlay/components/RelaysRoute.test.tsx`
- Modify: `src/nostr-overlay/components/RelayDetailRoute.test.tsx`
- Test: `tests/smoke/app-dark-mode.spec.ts`

- [ ] **Step 1: Write the failing assertions for audited pages still using legacy whites**

Add checks for:
- `#/descubre` mission rows
- `#/relays` main content surface
- any relay/settings cards that still show hardcoded white backgrounds once the routed shell is fixed

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: FAIL only on the remaining audited selectors, not on the already-migrated shared surfaces.

- [ ] **Step 3: Migrate remaining audited blocks to shadcn/Tailwind composition**

Guidelines while editing:
- keep `Card`, `Badge`, `Table`, `InputGroup`, `Button`, `Item` as the styling primitives
- use semantic utilities (`bg-card`, `text-card-foreground`, `text-muted-foreground`, `border-border`, `bg-muted/50`)
- use `gap-*`, not legacy spacing selectors
- avoid adding new dark-only custom selectors unless the value cannot be expressed via the Tailwind theme

- [ ] **Step 4: Remove hardcoded color rules that are now dead or theme-hostile**

Prioritise deleting legacy color rules for:

```css
.nostr-routed-surface-content
.nostr-easter-egg-missions-item
.nostr-easter-egg-missions-status
.nostr-relay-item
.nostr-zap-item
.nostr-settings-item
.nostr-settings-host
```

Do not remove layout-only selectors (`overflow`, `position`, `max-height`, etc.) unless the replacement is already in JSX utilities.

- [ ] **Step 5: Check accessibility in the implementation**

Before calling this task done, manually verify in the code and in the browser:
- text normal contrast >= `4.5:1`
- large KPI numbers >= `3:1`
- focus-visible rings remain obvious on dark surfaces
- interactive targets stay >= `24x24`
- placeholders/help text remain readable on cards and inputs

- [ ] **Step 6: Re-run the smoke test**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: PASS on `wallet`, `estadisticas`, `relays`, and `descubre` with no large visible light surfaces left.

- [ ] **Step 7: Commit**

```bash
git add src/nostr-overlay/components/DiscoverPage.tsx src/nostr-overlay/components/RelaysRoute.tsx src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx src/nostr-overlay/styles.css tests/smoke/app-dark-mode.spec.ts
git commit -m "refactor: finish audited dark mode migration to semantic surfaces"
```

### Task 6: Final verification, accessibility automation, and cleanup

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/smoke/app-dark-mode.spec.ts` (only if assertions need final cleanup)
- Modify: any touched source files from previous tasks

- [ ] **Step 1: Add automated accessibility checks to the smoke coverage**

Install `@axe-core/playwright` and extend the audited route smoke test with:
- an `axe` pass for the routed content area
- a keyboard focus check for migrated interactive controls (`Tab`, `:focus-visible`, visible ring)
- at least one assertion that status/charts do not rely on color alone for meaning

Run: `pnpm add -D @axe-core/playwright`

Expected: dependency installed and smoke spec ready to catch non-visual regressions too.

- [ ] **Step 2: Run the relevant unit tests**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/App.test.tsx src/nostr-overlay/components/WalletPage.test.tsx src/nostr-overlay/components/CityStatsPage.test.tsx src/nostr-overlay/components/DiscoverPage.test.tsx src/nostr-overlay/components/RelaysRoute.test.tsx src/nostr-overlay/components/RelayDetailRoute.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/components/settings-routes/OverlaySettingsRoutes.test.tsx`

Expected: PASS. Dark-mode-related unit coverage remains green.

- [ ] **Step 3: Run the smoke tests**

Run: `pnpm test:smoke`

Expected: PASS. The new dark-mode smoke spec and existing smoke tests all pass.

- [ ] **Step 4: Run lint and typecheck**

Run: `pnpm lint:frontend && pnpm typecheck:frontend`

Expected: PASS with no frontend lint or type errors.

- [ ] **Step 5: Manually spot-check the audited routes**

Verify these pages in both `light` and `dark` with the readonly `npub` session:
- `#/wallet`
- `#/estadisticas`
- `#/relays`
- `#/relays/detail?url=...&source=...&type=...` (or generate it with `buildRelayDetailPath()`)
- `#/descubre`

Confirm:
- no full-page light sheets remain in dark mode
- sidebar person cards visually belong to the dark theme
- KPI cards and charts read cleanly in dark mode
- focus rings remain visible on buttons, switches, dropdowns, and list items

- [ ] **Step 6: Re-run axe/focus checks after the manual pass**

Run: `pnpm build && playwright test tests/smoke/app-dark-mode.spec.ts --reporter=list`

Expected: PASS, including the `axe` assertions and keyboard focus checks.

- [ ] **Step 7: Commit**

```bash
git add app/index.html package.json pnpm-lock.yaml src/nostr-overlay/styles.css src/nostr-overlay/components/OverlaySurface.tsx src/nostr-overlay/components/WalletPage.tsx src/nostr-overlay/components/CityStatsPage.tsx src/nostr-overlay/components/DiscoverPage.tsx src/nostr-overlay/components/RelaysRoute.tsx src/nostr-overlay/components/RelayDetailRoute.tsx src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/UserSearchPage.tsx src/nostr-overlay/components/ChatsPage.tsx src/nostr-overlay/components/FollowingFeedSurface.tsx src/nostr-overlay/components/settings-routes/OverlaySettingsLayout.tsx src/nostr-overlay/components/PeopleListTab.tsx src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx src/nostr-overlay/components/WalletPage.test.tsx src/nostr-overlay/components/CityStatsPage.test.tsx src/nostr-overlay/components/DiscoverPage.test.tsx src/nostr-overlay/components/RelaysRoute.test.tsx src/nostr-overlay/components/RelayDetailRoute.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/components/settings-routes/OverlaySettingsRoutes.test.tsx tests/smoke/helpers/overlay-session.ts tests/smoke/app-dark-mode.spec.ts
git commit -m "refactor: migrate overlay dark mode to tailwind semantic theme"
```

## Notes For Execution

- Follow `@tailwind-v4-shadcn` for token placement, `@theme inline`, and class-based dark mode. Do not invent a second theming system.
- Follow `@shadcn` critical rules: use component variants and semantic tokens before custom CSS; avoid manual dark overrides when a semantic utility exists.
- Follow `@accessibility` while choosing muted colors and focus rings. “Looks darker” is not sufficient if contrast drops below WCAG AA.
- Do not keep selector-specific color overrides in `src/nostr-overlay/styles.css` once the JSX has semantic utility classes. The target end state is: custom CSS handles layout geometry; Tailwind/shadcn handle theming.

Plan complete and saved to `docs/superpowers/plans/2026-04-23-tailwind-shadcn-dark-mode-migration.md`. Ready to execute?
