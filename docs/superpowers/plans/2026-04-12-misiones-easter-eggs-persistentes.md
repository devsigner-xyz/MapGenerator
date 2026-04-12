# Misiones Easter Eggs Persistentes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un sistema de misiones de easter eggs con progreso persistente, dialogo de listado y marcadores visibles en el mapa incluso tras regenerar.

**Architecture:** El estado persistente se guarda por `easterEggId` en `localStorage` y se consume desde `App` como fuente unica para panel de misiones, dialogo y marcadores. El mapa expone la asignacion actual `buildingIndex -> easterEggId` a traves de `MapBridge` para recalcular posiciones tras cada regeneracion. `MapPresenceLayer` renderiza iconos no interactivos para easter eggs descubiertos.

**Tech Stack:** React + TypeScript + Vitest + Vite + Map bridge interno (`main.ts` / `main_gui.ts`)

---

### Task 1: Persistencia de progreso por easter egg

**Files:**
- Create: `src/nostr/easter-egg-progress.ts`
- Create: `src/nostr/easter-egg-progress.test.ts`

- [ ] **Step 1: Escribir tests RED de carga y guardado**
- [ ] **Step 2: Ejecutar test focalizado y verificar fallo esperado**
- [ ] **Step 3: Implementar `loadEasterEggProgress` / `saveEasterEggProgress` / `markEasterEggDiscovered`**
- [ ] **Step 4: Ejecutar test focalizado y verificar GREEN**

### Task 2: Exponer asignacion de easter eggs en el bridge

**Files:**
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/main.ts`
- Modify: `src/nostr-overlay/map-bridge.ts`
- Modify: `src/nostr-overlay/map-bridge.test.ts`

- [ ] **Step 1: Escribir test RED para `listEasterEggBuildings` en bridge**
- [ ] **Step 2: Ejecutar test focalizado y verificar fallo esperado**
- [ ] **Step 3: Implementar getter en `MainGUI` y passthrough en `main.ts` + `map-bridge.ts`**
- [ ] **Step 4: Ejecutar test focalizado y verificar GREEN**

### Task 3: Modelo de marcadores de easter eggs descubiertos

**Files:**
- Modify: `src/nostr-overlay/domain/presence-layer-model.ts`
- Modify: `src/nostr-overlay/domain/presence-layer-model.test.ts`

- [ ] **Step 1: Escribir test RED para construir entradas de easter eggs descubiertos por asignacion actual**
- [ ] **Step 2: Ejecutar test focalizado y verificar fallo esperado**
- [ ] **Step 3: Implementar builder de entries de easter eggs descubiertos**
- [ ] **Step 4: Ejecutar test focalizado y verificar GREEN**

### Task 4: UI de misiones (panel Informacion + dialogo)

**Files:**
- Create: `src/nostr-overlay/components/EasterEggMissionsDialog.tsx`
- Modify: `src/nostr-overlay/components/ProfileTab.tsx`
- Modify: `src/nostr-overlay/components/SocialSidebar.tsx`
- Modify: `src/nostr-overlay/components/ProfileTab.test.tsx`

- [ ] **Step 1: Escribir tests RED para CTA Misiones y estados Pendiente/Encontrado**
- [ ] **Step 2: Ejecutar test focalizado y verificar fallo esperado**
- [ ] **Step 3: Implementar bloque Misiones en tab Informacion y dialogo listado**
- [ ] **Step 4: Ejecutar test focalizado y verificar GREEN**

### Task 5: Wiring final en App + mapa

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/components/MapPresenceLayer.tsx`
- Modify: `src/nostr-overlay/components/MapPresenceLayer.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] **Step 1: Escribir tests RED para progreso persistente, apertura de dialogo, y marcadores tras regeneracion**
- [ ] **Step 2: Ejecutar tests focalizados y verificar fallo esperado**
- [ ] **Step 3: Implementar estado en `App` y props hacia `SocialSidebar` + `MapPresenceLayer`**
- [ ] **Step 4: Implementar rendering de icono estrella persistente en `MapPresenceLayer`**
- [ ] **Step 5: Ajustar estilos de bloque, dialogo y marcador**
- [ ] **Step 6: Ejecutar tests focalizados y verificar GREEN**

### Task 6: Verificacion final

**Files:**
- Modify (si aplica): archivos tocados durante las tareas anteriores

- [ ] **Step 1: Ejecutar suite de tests relacionada**
- [ ] **Step 2: Ejecutar `pnpm typecheck`**
- [ ] **Step 3: Ejecutar `pnpm build`**
- [ ] **Step 4: Revisar diff final para confirmar que cumple el alcance solicitado**
