# Nostr Overlay UI: Context Menu, Spinners, Switch y About Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la UX del overlay con menu contextual en edificios (right click), indicadores de carga con `Spinner` en todos los listados con carga incremental, reemplazo de checkbox por `Switch`, feedback de carga al enviar `npub`, y un panel `About` con NIPs soportadas y caracteristicas.

**Architecture:** Extender el bridge mapa-overlay para propagar eventos de `contextmenu` desde canvas a React, centralizar acciones del menu contextual en `App`, y estandarizar indicadores de carga con `Spinner` de shadcn en listas y acciones asincronas. Mantener compatibilidad con el flujo actual de `useNostrOverlay` y con el layout existente del panel lateral.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, shadcn/ui (`context-menu`, `spinner`, `switch`), Radix primitives via shadcn.

---

## Chunk 1: Base de componentes y utilidades UI

### Task 1: Agregar componentes shadcn faltantes

**Files:**
- Create: `src/components/ui/context-menu.tsx`
- Create: `src/components/ui/spinner.tsx`

- [ ] Ejecutar `pnpm dlx shadcn@latest add context-menu spinner`.
- [ ] Verificar imports con alias `@/components/ui/*`.
- [ ] Confirmar que no se rompen componentes existentes.

### Task 2: Definir patron comun para estado de carga en listas

**Files:**
- Create: `src/nostr-overlay/components/ListLoadingFooter.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] Crear componente reutilizable `ListLoadingFooter` con `Spinner` + texto.
- [ ] Exponer props minimas (`loading`, `label`).
- [ ] Estilizar footer para que quede fijo al final visual de cada lista (sin tapar items).

### Task 3: Verificacion del chunk 1

**Files:**
- Test: `src/nostr-overlay/components/PeopleListTab.test.tsx`

- [ ] Run: `pnpm vitest run src/nostr-overlay/components/PeopleListTab.test.tsx`
- [ ] Expected: PASS sin regresiones base.

## Chunk 2: Context menu en right click sobre edificios

### Task 4: Extender eventos del mapa para soportar contextmenu de edificios ocupados

**Files:**
- Modify: `src/main.ts`
- Modify: `src/nostr-overlay/map-bridge.ts`
- Modify: `src/nostr-overlay/map-bridge.test.ts`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Definir nuevo payload `OccupiedBuildingContextPayload` con `buildingIndex`, `pubkey`, `clientX`, `clientY`.
- [ ] Agregar `subscribeOccupiedBuildingContextMenu` en `Main` y `onOccupiedBuildingContextMenu` en `MapBridge`.
- [ ] En canvas, escuchar `contextmenu`, resolver edificio ocupado bajo cursor, hacer `preventDefault()` y notificar evento solo si hay hit.
- [ ] Testear suscripcion/unsubscripcion en bridge y emision de evento en App con mocks.

### Task 5: Renderizar ContextMenu con acciones sobre ocupante

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Crear estado UI para menu contextual (`open`, `anchor`, `pubkey`, `buildingIndex`).
- [ ] Mostrar menu con acciones: `Copiar npub`, `Escribir DM`, `Explorar alternativas`.
- [ ] Implementar `Copiar npub` reutilizando `copyOwnerIdentifier`.
- [ ] Implementar `Escribir DM` con intento de deep-link `nostr:<npub>` y fallback a copiado + toast.
- [ ] En `Explorar alternativas`, incluir al menos: `Ubicar en mapa` y `Abrir perfil` (usando API explicita del hook para activar modal por pubkey).

### Task 6: Verificacion del chunk 2

**Files:**
- Test: `src/nostr-overlay/map-bridge.test.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] Run: `pnpm vitest run src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/App.test.tsx`
- [ ] Expected: PASS con coverage de right click + acciones.

## Chunk 3: Spinner en todos los listados con carga incremental por scroll

### Task 7: Aplicar carga incremental + spinner en `Sigues`/`Seguidores` del sidebar

**Files:**
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`
- Modify: `src/nostr-overlay/components/SocialSidebar.tsx`
- Modify: `src/nostr-overlay/components/PeopleListTab.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Agregar paginado incremental por scroll (tamano inicial + incremento por umbral inferior).
- [ ] Mostrar `ListLoadingFooter` al final cuando se este ampliando la ventana de items.
- [ ] Mantener virtualizacion para listas grandes y evitar doble trigger de carga.
- [ ] Cubrir escenarios de scroll al fondo y desaparicion del spinner al completar lote.

### Task 8: Aplicar carga incremental + spinner en modal de ocupante (`Sigue a`/`Le siguen`)

**Files:**
- Modify: `src/nostr-overlay/components/OccupantProfileModal.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] Reemplazar `slice(0, 20)` fijo por estado incremental controlado por scroll interno del modal.
- [ ] Mostrar `ListLoadingFooter` para ambas columnas mientras se agregan mas filas.
- [ ] Mantener comportamiento actual cuando la lista es corta (sin spinner persistente).

### Task 9: Unificar spinner para publicaciones del perfil activo

**Files:**
- Modify: `src/nostr-overlay/components/OccupantProfileModal.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Sustituir texto plano `Cargando publicaciones...` por `Spinner` + label accesible.
- [ ] Mantener `onLoadMorePosts` por scroll y boton `Cargar mas` como fallback manual.

### Task 10: Verificacion del chunk 3

**Files:**
- Test: `src/nostr-overlay/components/PeopleListTab.test.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] Run: `pnpm vitest run src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/App.test.tsx`
- [ ] Expected: PASS con asserts sobre spinners en todas las listas incrementales.

## Chunk 4: Switch en settings, spinner de npub y panel About

### Task 11: Reemplazar checkbox por `Switch` en UI settings

**Files:**
- Modify: `src/nostr-overlay/components/MapSettingsModal.tsx`
- Modify: `src/nostr-overlay/components/MapSettingsModal.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] Cambiar `input type="checkbox"` de street labels por `Switch` de shadcn.
- [ ] Mantener `aria-label`, persistencia y sincronizacion con `uiSettings.streetLabelsEnabled`.
- [ ] Ajustar estilos de fila para alineacion visual label/control.

### Task 12: Mostrar spinner al enviar npub y cargar informacion

**Files:**
- Modify: `src/nostr-overlay/components/NpubForm.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Exponer prop `loading` en `NpubForm` ademas de `disabled`.
- [ ] Considerar loading cuando `overlay.status` sea `loading_graph | loading_profiles | assigning_map | loading_followers`.
- [ ] Renderizar `Spinner` en boton `Visualize` con texto contextual (`Cargando...`).

### Task 13: Agregar vista `About` con NIPs soportadas y features

**Files:**
- Modify: `src/nostr-overlay/components/MapSettingsModal.tsx`
- Modify: `src/nostr-overlay/components/MapSettingsModal.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] Extender `SettingsView` con opcion `about` y agregar item en pantalla principal de settings.
- [ ] Mostrar lista de NIPs/estandares soportados: `NIP-19`, `NIP-65`, `kind 0`, `kind 1`, `kind 3`.
- [ ] Mostrar listado corto de caracteristicas: overlay social, perfiles ocupantes, relays configurables, carga progresiva, estadisticas ciudad.
- [ ] Mantener navegacion `Volver` y accesibilidad del modal.

### Task 14: Verificacion final

**Files:**
- Test: `src/nostr-overlay/**/*.test.tsx`
- Test: `src/nostr-overlay/map-bridge.test.ts`

- [ ] Run: `pnpm vitest run src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/components/MapSettingsModal.test.tsx src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/App.test.tsx`
- [ ] Expected: PASS en los tests tocados por el cambio.
- [ ] Run: `pnpm typecheck`
- [ ] Expected: sin errores TypeScript.
- [ ] Run: `pnpm build`
- [ ] Expected: build exitoso.

## Riesgos y mitigaciones

- [ ] **Riesgo:** acoplamiento canvas/React para right click. **Mitigacion:** nuevo evento tipado en bridge + tests de suscripcion.
- [ ] **Riesgo:** multiples disparos de carga incremental por scroll. **Mitigacion:** guard de estado `isLoadingMore` + umbral unico por lista.
- [ ] **Riesgo:** regresion en virtualizacion de `PeopleListTab`. **Mitigacion:** mantener threshold actual y cubrir con tests de listas grandes.
- [ ] **Riesgo:** deep-link DM no soportado en algunos entornos. **Mitigacion:** fallback robusto a copiado y toast explicativo.

## Criterios de aceptacion

- [ ] Right click sobre edificio ocupado abre menu contextual con acciones funcionales.
- [ ] Existen spinners de shadcn en todos los listados con carga incremental por scroll.
- [ ] El toggle de street labels usa `Switch` en lugar de checkbox.
- [ ] Al enviar `npub`, el usuario ve spinner de carga hasta completar pipeline.
- [ ] Existe panel `About` visible desde settings con NIPs soportadas y features de la app.
