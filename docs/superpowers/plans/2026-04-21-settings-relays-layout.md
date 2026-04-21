# Settings Relays Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el layout de la pantalla de relays para eliminar recortes y scroll horizontal, mover las secciones secundarias debajo del listado principal y limitar cada tabla a `800px` con scroll independiente.

**Architecture:** El cambio se concentra en `SettingsRelaysPage` y su CSS ya existente. La implementación elimina el layout lateral, reordena el JSX para apilar las secciones en vertical y mueve el scroll a wrappers internos de tabla para que `Relays configurados` y `Relays sugeridos` tengan viewports independientes sin tocar la lógica de relays.

**Tech Stack:** React 19, TypeScript, CSS global de overlay, shadcn/ui Card/Table, Vitest.

---

## File Structure

- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
  - Reordenar la página, eliminar el helper copy superior, mover badges al header principal y sacar `Añadir relay` / `Relays sugeridos` del sidebar.
- Modify: `src/nostr-overlay/styles.css`
  - Reemplazar el grid lateral por un flujo vertical y definir wrappers scrollables de tabla con `max-height: 800px`, `overflow-y: auto` y `overflow-x: hidden`.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
  - Ajustar el contrato de render para el nuevo orden visual, la desaparición del sidebar y la presencia de wrappers de scroll dedicados.

## Chunk 1: Component Render Contract

### Task 1: Actualizar los tests del layout de relays

**Files:**
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`

- [ ] **Step 1: Write failing tests for the new page structure**

```ts
test('renders configured relays first and stacks add-relay and suggested sections below', async () => {
  const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
  const text = rendered.container.textContent || '';

  expect(rendered.container.querySelector('.nostr-relays-sidebar')).toBeNull();
  expect(text).not.toContain('Conecta varios relays. Puedes agregar uno por vez y elegir categoria.');
  expect(text).toContain('Relays configurados');
  expect(text.indexOf('Relays configurados')).toBeLessThan(text.indexOf('Añadir relay'));
  expect(text.indexOf('Añadir relay')).toBeLessThan(text.indexOf('Relays sugeridos'));
  expect(rendered.container.querySelector('button[aria-label="Categoria del relay"]')).not.toBeNull();
  expect(rendered.container.querySelector('.nostr-relay-connection-summary')?.querySelectorAll('[data-slot="badge"]')).toHaveLength(3);
});

test('renders dedicated scroll wrappers for configured and suggested relay tables', async () => {
  const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);

  expect(rendered.container.querySelector('.nostr-relay-table-scroll')).not.toBeNull();
  expect(rendered.container.querySelector('.nostr-relay-suggested-scroll')).not.toBeNull();
});
```

- [ ] **Step 2: Run the page test to verify RED state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: FAIL because the current JSX still renders a sidebar and does not expose the new scroll-wrapper structure.

- [ ] **Step 3: Keep the failing expectations focused on structure only**

Guardrails:
- Do not assert computed CSS.
- Do assert DOM order, missing sidebar, preserved summary badges, and preserved category control.

- [ ] **Step 4: Re-run the test and keep it RED until JSX/CSS are updated**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: still FAIL.

## Chunk 2: JSX + CSS Implementation

### Task 2: Reordenar `SettingsRelaysPage` al nuevo flujo vertical

**Files:**
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`

- [ ] **Step 1: Remove the obsolete helper copy**

Delete:

```tsx
<p className="nostr-relays-help">Conecta varios relays. Puedes agregar uno por vez y elegir categoria.</p>
```

- [ ] **Step 2: Move summary badges into the configured-relays card header**

Target structure:

```tsx
<CardHeader className="border-b px-3 py-3">
  <CardTitle>Relays configurados</CardTitle>
  <CardDescription>Estado actual y categorias activas de tus relays.</CardDescription>
  <div className="nostr-relay-connection-summary" role="status" aria-live="polite">...</div>
</CardHeader>
```

- [ ] **Step 3: Remove the current `aside` sidebar container from `SettingsRelaysPage.tsx`**

Delete the `aside.nostr-relays-sidebar` wrapper and keep its child cards as regular stacked sections inside the main page flow.

- [ ] **Step 4: Re-home `Añadir relay` directly below the configured-relays card**

Keep the current add-relay controls and callbacks intact; only change their placement in the DOM.

- [ ] **Step 5: Re-home `Relays sugeridos` below `Añadir relay`**

Keep the current suggested-relay table and callbacks intact; only change placement and wrapper classes.

- [ ] **Step 6: Introduce the vertical stack container for the lower sections**

Target structure:

```tsx
<div className="nostr-relays-content">
  <div className="nostr-relays-main">
    <Card className="nostr-relay-table-card ...">...</Card>
    <div className="nostr-relays-secondary-stack">
      <Card className="nostr-relays-panel ...">Añadir relay</Card>
      <Card className="nostr-relays-panel ...">Relays sugeridos</Card>
    </div>
  </div>
</div>
```

- [ ] **Step 7: Wrap each table in its dedicated scroll viewport**

Configured table:

```tsx
<CardContent className="px-0 py-0">
  <div className="nostr-relay-table-scroll">
    <Table className="nostr-relay-table">...</Table>
  </div>
</CardContent>
```

Suggested table:

```tsx
<CardContent className="px-0 py-0">
  <div className="nostr-relay-table-scroll nostr-relay-suggested-scroll">
    <Table className="nostr-relay-table">...</Table>
  </div>
</CardContent>
```

- [ ] **Step 8: Keep behavior callbacks untouched**

Check that these callbacks remain wired exactly as before:
- `onAddRelays`
- `onOpenRelayDetails`
- `onRemoveRelay`
- `onAddSuggestedRelay`
- `onAddAllSuggestedRelays`
- `onResetRelaysToDefault`

### Task 3: Ajustar estilos para scroll independiente y sin overflow horizontal

**Files:**
- Modify: `src/nostr-overlay/styles.css`

- [ ] **Step 1: Remove or neutralize the two-column relays layout**

Replace the old sidebar-oriented rules with a vertical stack:

```css
.nostr-relays-content,
.nostr-relays-main,
.nostr-relays-secondary-stack {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
```

- [ ] **Step 2: Delete or neutralize now-unused sidebar layout rules**

Specifically review and remove/neutralize CSS tied only to the old sidebar layout, including:
- `.nostr-relays-layout`
- `.nostr-relays-sidebar`
- `.nostr-relays-sidebar .nostr-relay-table-wrap`

- [ ] **Step 3: Define the main table viewport contract**

```css
.nostr-relay-table-card {
  box-shadow: none;
}

.nostr-relay-table-scroll {
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}
```

- [ ] **Step 4: Preserve the table sizing contract explicitly**

Verify or restore these existing rules as part of the change:

```css
.nostr-relay-table {
  width: 100%;
  table-layout: fixed;
}
```

This must remain true for both configured and suggested tables.

- [ ] **Step 5: Preserve containment for long content**

Ensure these rules remain true or are reinforced:
- `.nostr-relay-main-cell` / inner wrappers keep `min-width: 0`
- `.nostr-relay-summary-primary` keeps aggressive wrapping (`word-break: break-all` or equivalent)
- `.nostr-relay-nip-badges` keeps `flex-wrap: wrap`
- action column stays width-limited

- [ ] **Step 6: Keep mobile behavior simple**

Remove the need for a relays-specific responsive column switch; the vertical stack should work the same on desktop and mobile without a sidebar breakpoint.

- [ ] **Step 7: Re-run the page test and verify GREEN state**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: PASS.

## Chunk 3: Verification

### Task 4: Run focused verification for relay page changes

**Files:**
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`

- [ ] **Step 1: Run the relay page test file**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run a targeted broader frontend smoke around the relays page if needed**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx -t "relay list"`
Expected: PASS or no matching tests; if no tests match, document that only the page-level test was available for this change.

- [ ] **Step 3: Run browser verification for the visual regression targets**

Launch the app with `pnpm dev`, open `http://127.0.0.1:5173`, navigate to the overlay settings screen that renders `SettingsRelaysPage` (`Relays` in the settings/relays flow), and verify manually:
- the configured-relays block no longer clips on the left edge
- the configured-relays block no longer clips on the bottom edge
- neither table shows horizontal scroll
- `Relays configurados` has its own vertical scroll when content exceeds `800px`
- `Relays sugeridos` has its own vertical scroll when content exceeds `800px`

If the existing app state does not naturally provide enough rows to test `800px` scrolling, document that visual verification was limited to structure and overflow behavior visible in the available data.

- [ ] **Step 4: Summarize final evidence**

Capture:
- which files changed
- which tests ran
- what browser/manual checks were completed
- whether any broader verification was unavailable or unnecessary
