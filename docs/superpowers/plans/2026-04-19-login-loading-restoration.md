# Login Loading And Restoration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quitar el loader superior del login, mover el progreso al boton primario y evitar que el formulario reaparezca durante la restauracion de sesion.

**Architecture:** El cambio se resuelve con una separacion minima entre restauracion automatica y login manual. `useNostrOverlay` mantiene bloqueada la restauracion hasta que termina `loadOwnerGraph()` para sesiones restauradas, `LoginGateScreen` deja de mostrar logout y loader superior, y `LoginMethodSelector` reutiliza `mapLoaderText` como copy del boton activo.

**Tech Stack:** React, TypeScript, Vitest, shadcn/ui

---

## Chunk 1: Auth Gate Loading Contract

### Task 1: Fijar el comportamiento con tests

**Files:**
- Modify: `src/nostr-overlay/components/LoginGateScreen.test.tsx`
- Modify: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Escribir tests que fallen primero**

Agregar cobertura para asegurar:

- `LoginGateScreen` no renderiza `Cerrar sesion` aunque reciba sesion activa.
- `LoginGateScreen` no renderiza `mapLoaderText` como bloque superior fuera del boton.
- `LoginGateScreen` en `restoringSession` muestra solo `Restaurando sesion...` y no muestra `Metodo de acceso` ni inputs de login.
- `LoginMethodSelector` usa `mapLoaderText` como label del boton visible en `npub` y `nip07`.
- `LoginMethodSelector` mantiene `Cargando...` como fallback cuando el selector esta ocupado sin texto de progreso.
- `App` no deja ver el formulario durante una restauracion persistida que aun no ha terminado de cargar el grafo.
- `App` desbloquea correctamente el gate cuando no hay sesion persistida valida.
- `App` reemplaza el gate directamente por la UI autenticada cuando la restauracion termina con `success`.
- `App` desbloquea el gate y permite volver al login cuando la restauracion termina con `error`.

- [ ] **Step 2: Ejecutar los tests enfocados y confirmar fallo**

Run: `pnpm vitest run src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/App.test.tsx`

Expected: FAIL por la presencia del logout, el loader superior, el copy `Cargando...` o el parpadeo del formulario.

### Task 2: Implementar el cambio minimo en auth gate y selector

**Files:**
- Modify: `src/nostr-overlay/components/LoginGateScreen.tsx`
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [ ] **Step 3: Mantener bloqueada la restauracion hasta completar la carga inicial**

Cambiar `useNostrOverlay` para que `sessionRestorationResolved` permanezca en `false` mientras una sesion restaurada valida sigue dentro de `loadOwnerGraph()`, y solo pase a `true` al finalizar con `success`, `error` o ausencia de sesion persistida.

- [ ] **Step 4: Simplificar `LoginGateScreen`**

Cambios esperados:

- eliminar el bloque superior que hoy muestra `mapLoaderText`
- eliminar el boton `Cerrar sesion`
- cuando `restoringSession` sea `true`, renderizar unicamente el estado de restauracion dentro del card
- pasar `mapLoaderText` hacia `LoginMethodSelector`
- dejar de depender de `showLogout` en el gate y reflejarlo tambien desde `App.tsx`

- [ ] **Step 5: Mover el copy de progreso al boton activo**

Cambiar `LoginMethodSelector` para aceptar un texto opcional de progreso y mostrarlo junto al spinner inline en el boton visible del metodo activo. Si no hay texto, mantener `Cargando...` como fallback.

- [ ] **Step 6: Ejecutar los tests enfocados y confirmar que pasen**

Run: `pnpm vitest run src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/App.test.tsx`

Expected: PASS.

### Task 3: Verificacion final acotada

**Files:**
- No code changes expected

- [ ] **Step 7: Ejecutar verificacion final de la zona tocada**

Run: `pnpm vitest run src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/App.test.tsx`

Expected: PASS con evidencia fresca antes de cerrar la tarea.

- [ ] **Step 8: Commit solo si el usuario lo pide**

No crear commit automaticamente.
