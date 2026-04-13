# Overlay Settings Controller/View Routes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar Settings a rutas reales por seccion con arquitectura controller+view, reutilizando layout y utilidades compartidas, y eliminando `MapSettingsPage` al final.

**Architecture:** Separar shell de settings (layout compartido) de la logica por dominio (controllers por ruta). Cada subruta (`ui`, `relays`, `relays/detail`, `zaps`, `about`, `shortcuts`, `advanced`) tendra su route component que conecta controller + view presentacional. Mantener compatibilidad temporal de rutas heredadas y cerrar la migracion eliminando componente monolitico.

**Tech Stack:** React 19, react-router 7, TypeScript, TanStack Query, Vitest, CSS actual del overlay.

---

## Chunk 1: Base de rutas y contratos compartidos

### Task 1: Centralizar parsing y tipos de rutas de settings

**Files:**
- Create: `src/nostr-overlay/settings/settings-routing.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/OverlaySidebar.tsx`
- Create: `src/nostr-overlay/settings/settings-routing.test.ts`

- [ ] Crear constantes y helpers compartidos (`SETTINGS_VIEWS`, `isSettingsView`, `settingsViewFromPathname`, `buildSettingsPath`).
- [ ] Reemplazar parsing duplicado de settings en `App.tsx` por util compartida.
- [ ] Reemplazar parsing duplicado en `OverlaySidebar.tsx` y asegurar que no se rompa la vista activa.
- [ ] Agregar tests unitarios del parser/builders de rutas.
- [ ] Ejecutar tests focalizados de routing/settings.

## Chunk 2: Layout compartido de settings

### Task 2: Crear `OverlaySettingsLayout` como shell comun

**Files:**
- Create: `src/nostr-overlay/components/settings-routes/OverlaySettingsLayout.tsx`
- Create: `src/nostr-overlay/components/settings-routes/settings-route-context.tsx`
- Modify: `src/nostr-overlay/components/SettingsPage.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/types.ts`

- [ ] Crear layout con `Outlet`, wrappers accesibles y control de `variant` (`surface`/`dialog`).
- [ ] Definir contexto compartido de settings (owner, bridge, probes, callbacks comunes).
- [ ] Mantener contrato actual de `SettingsPage` mientras la migracion esta en curso.
- [ ] Verificar que el layout no introduzca estado de dominio.

## Chunk 3: Rutas simples (UI, Zaps, About, Shortcuts, Advanced)

### Task 3: Separar controllers de secciones no-relay

**Files:**
- Create: `src/nostr-overlay/components/settings-routes/SettingsUiRoute.tsx`
- Create: `src/nostr-overlay/components/settings-routes/SettingsZapsRoute.tsx`
- Create: `src/nostr-overlay/components/settings-routes/SettingsAboutRoute.tsx`
- Create: `src/nostr-overlay/components/settings-routes/SettingsShortcutsRoute.tsx`
- Create: `src/nostr-overlay/components/settings-routes/SettingsAdvancedRoute.tsx`
- Create: `src/nostr-overlay/components/settings-routes/controllers/useUiSettingsController.ts`
- Create: `src/nostr-overlay/components/settings-routes/controllers/useZapSettingsController.ts`
- Create: `src/nostr-overlay/components/settings-routes/controllers/useAdvancedSettingsController.ts`

- [ ] Mover persistencia de UI a `useUiSettingsController`.
- [ ] Mover persistencia de zaps a `useZapSettingsController`.
- [ ] Mover ciclo de vida `mountSettingsPanel` a `useAdvancedSettingsController`.
- [ ] Conectar cada route component con su `Settings*Page` presentacional.

## Chunk 4: Relays list + relay detail con ruta real

### Task 4: Extraer dominio relays a controllers y ruta detalle

**Files:**
- Create: `src/nostr-overlay/components/settings-routes/SettingsRelaysRoute.tsx`
- Create: `src/nostr-overlay/components/settings-routes/SettingsRelayDetailRoute.tsx`
- Create: `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts`
- Create: `src/nostr-overlay/components/settings-routes/controllers/useRelayDetailController.ts`
- Create: `src/nostr-overlay/settings/relay-detail-routing.ts`
- Create: `src/nostr-overlay/settings/relay-detail-routing.test.ts`

- [ ] Mover estado/acciones de relays (add/remove/suggested/reset/status) al controller de lista.
- [ ] Implementar ruta detalle (`/settings/relays/detail`) basada en query params (`url`, `source`, `type`).
- [ ] Mover resolucion de metadata NIP-11 y datos derivados de detalle al controller de detalle.
- [ ] Conectar `SettingsRelaysPage` para navegar a ruta detalle y no cambiar estado local interno.
- [ ] Preservar comportamiento de badges/status/performance de probes.

## Chunk 5: Migracion de routing principal y compatibilidad legacy

### Task 5: Mover `/settings/:view` a nested routes

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/OverlaySidebar.tsx`
- Modify: `src/nostr-overlay/components/SettingsPage.tsx`

- [ ] Definir nested routes de settings bajo layout compartido.
- [ ] Agregar redirecciones de compatibilidad temporal (`/settings`, rutas invalidas, legacy segment).
- [ ] Asegurar que `relays/detail` mantenga item Relays activo en sidebar.
- [ ] Mantener `onClose` consistente (volver a `/`).

## Chunk 6: Migracion de tests y retiro de `MapSettingsPage`

### Task 6: Reorganizar suites por ruta/controlador

**Files:**
- Rename/Split: `src/nostr-overlay/components/MapSettingsPage.test.tsx`
- Create: `src/nostr-overlay/components/settings-routes/*.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Delete: `src/nostr-overlay/components/MapSettingsPage.tsx` (cuando no haya dependencias)

- [ ] Dividir tests por dominio (ui, zaps, advanced, relays, relay-detail).
- [ ] Agregar tests de deep-link a relay detail y fallback por query invalida.
- [ ] Verificar cleanup de `mountSettingsPanel(null)` al salir de advanced.
- [ ] Eliminar `MapSettingsPage` cuando todo pase con rutas nuevas.

## Chunk 7: Regresion y cierre

### Task 7: Validacion final de comportamiento

**Files:**
- Verify: `src/nostr-overlay/App.test.tsx`
- Verify: `src/nostr-overlay/components/settings-routes/*.test.tsx`
- Verify: `src/nostr-overlay/components/OverlaySidebar.tsx`

- [ ] Ejecutar tests focalizados de settings/routing.
- [ ] Ejecutar `pnpm test` y `pnpm typecheck`.
- [ ] Validar navegacion manual: `/settings/ui`, `/settings/relays`, `/settings/relays/detail?...`, boton cerrar, sidebar activo.
