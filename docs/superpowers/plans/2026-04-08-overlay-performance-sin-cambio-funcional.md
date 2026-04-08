# Overlay Performance (Sin Cambio Funcional) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar rendimiento de overlay para miles de usuarios (listas, tags del mapa y eventos de vista) sin cambiar comportamiento visible.

**Architecture:** Mantener API publica y UX actual, pero reducir trabajo por render con tres optimizaciones: (1) coalescing de eventos de vista a una notificacion por frame, (2) desacople entre datos y posicion en tags del mapa con culling por viewport, y (3) virtualizacion de listas largas en sidebar. Primero se congela comportamiento con tests, luego se refactoriza en pasos pequenos y verificables.

**Tech Stack:** React 19, TypeScript, Vitest, Vite, Nostr overlay actual (MapBridge + hooks).

---

### Task 1: Congelar comportamiento actual con tests de regresion

**Files:**
- Create: `src/nostr-overlay/components/PeopleListTab.test.tsx`
- Modify: `src/nostr-overlay/components/MapPresenceLayer.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Escribir tests que definan comportamiento de PeopleListTab**

```tsx
test('permite buscar por nombre/pubkey y limpiar busqueda');
test('mantiene seleccion y dispara onSelectPerson al click');
test('muestra estado vacio y loading segun props');
```

- [ ] **Step 2: Escribir tests extra para MapPresenceLayer orientados a parity**

```tsx
test('owner tooltip se mantiene visible con zoom bajo');
test('alwaysVisiblePubkeys respeta visibilidad bajo umbral');
test('clip inset aplica exactamente el valor del bridge');
```

- [ ] **Step 3: Ejecutar tests para verificar baseline verde**

Run: `pnpm vitest run src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/components/MapPresenceLayer.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/components/MapPresenceLayer.test.tsx src/nostr-overlay/App.test.tsx
git commit -m "test: lock overlay behavior before performance refactor"
```

### Task 2: Reducir frecuencia de notificaciones de vista en `Main`

**Files:**
- Create: `src/ts/ui/view_change_scheduler.ts`
- Create: `src/ts/ui/view_change_scheduler.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Escribir tests fallando para scheduler de notificaciones**

```ts
test('coalesce: multiples trigger en el mismo frame notifican una vez');
test('flush: el siguiente frame vuelve a permitir notify');
test('dispose: cancela callback pendiente');
```

- [ ] **Step 2: Ejecutar test para confirmar falla inicial**

Run: `pnpm vitest run src/ts/ui/view_change_scheduler.test.ts`
Expected: FAIL (modulo no implementado)

- [ ] **Step 3: Implementar scheduler minimo y usarlo en `Main`**

```ts
// idea: schedule() con requestAnimationFrame y bandera pending
// main.update(): reemplazar notifyViewChanged() directo por scheduler.schedule(notifyViewChanged)
```

- [ ] **Step 4: Re-ejecutar tests del scheduler y smoke de overlay**

Run: `pnpm vitest run src/ts/ui/view_change_scheduler.test.ts src/nostr-overlay/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ts/ui/view_change_scheduler.ts src/ts/ui/view_change_scheduler.test.ts src/main.ts
git commit -m "perf: coalesce view-change events to one per frame"
```

### Task 3: Optimizar `MapPresenceLayer` sin cambiar salida visual

**Files:**
- Create: `src/nostr-overlay/domain/presence-layer-model.ts`
- Create: `src/nostr-overlay/domain/presence-layer-model.test.ts`
- Modify: `src/nostr-overlay/components/MapPresenceLayer.tsx`
- Modify: `src/nostr-overlay/components/MapPresenceLayer.test.tsx`

- [ ] **Step 1: Escribir tests de modelo (filtro por zoom, always-visible, culling, owner)**

```ts
test('si zoom < threshold solo quedan alwaysVisible');
test('si zoom >= threshold quedan todos los ocupados');
test('culling excluye elementos fuera de viewport con margen');
```

- [ ] **Step 2: Ejecutar tests para confirmar falla inicial**

Run: `pnpm vitest run src/nostr-overlay/domain/presence-layer-model.test.ts`
Expected: FAIL (modulo no implementado)

- [ ] **Step 3: Implementar modelo puro y conectar en componente**

```ts
// useMemo para datos estables (entries, nombres, avatar)
// actualizar solo posiciones en cambios de vista (rAF), evitando trabajo de datos
// mantener owner tooltip y clipPath actuales
```

- [ ] **Step 4: Ejecutar tests del layer + app**

Run: `pnpm vitest run src/nostr-overlay/components/MapPresenceLayer.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/domain/presence-layer-model.ts src/nostr-overlay/domain/presence-layer-model.test.ts src/nostr-overlay/components/MapPresenceLayer.tsx src/nostr-overlay/components/MapPresenceLayer.test.tsx
git commit -m "perf: reduce map tag recomputation and add viewport culling"
```

### Task 4: Virtualizar listas largas en `PeopleListTab`

**Files:**
- Modify: `package.json`
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`
- Modify: `src/nostr-overlay/components/PeopleListTab.test.tsx`
- Modify: `src/nostr-overlay/styles.css` (solo si hace falta altura/overflow estable)

- [ ] **Step 1: Agregar tests de virtualizacion con parity funcional**

```tsx
test('con lista grande renderiza subconjunto visible, no toda la lista');
test('buscar sigue filtrando correctamente');
test('click en item visible mantiene onSelectPerson');
```

- [ ] **Step 2: Ejecutar test para validar que falla antes de implementar**

Run: `pnpm vitest run src/nostr-overlay/components/PeopleListTab.test.tsx`
Expected: FAIL (se renderiza lista completa)

- [ ] **Step 3: Implementar virtualizacion manteniendo markup/estilos existentes**

```tsx
// Recomendado: TanStack Virtual con umbral (p.ej. >120 items)
// Lista pequena: mantener ruta actual
// Lista grande: ventana virtual con rowHeight fijo y overscan
```

- [ ] **Step 4: Ejecutar tests de lista y app**

Run: `pnpm vitest run src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json src/nostr-overlay/components/PeopleListTab.tsx src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/styles.css
git commit -m "perf: virtualize large social lists without UX changes"
```

### Task 5: Verificacion integral y comparacion antes/despues

**Files:**
- Optional Create: `docs/superpowers/plans/2026-04-08-overlay-performance-metrics.md`

- [ ] **Step 1: Ejecutar suite unitaria completa**

Run: `pnpm test:unit`
Expected: PASS

- [ ] **Step 2: Ejecutar build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Verificacion manual de parity funcional**

Checklist:
- Carga de npub y rendering de panel social
- Busqueda en "Sigues" y seleccion de usuario
- Zoom/pan con tags visibles
- Owner tooltip en mapa
- Modal de perfil, posts y estadisticas

- [ ] **Step 4: Validar mejora de rendimiento (sin requerir cambio UX)**

Medir al menos:
- Menos callbacks `onViewChanged` durante pan continuo
- Menos nodos DOM en lista grande
- Menos stutter percibido en zoom/pan con muchos tags

- [ ] **Step 5: Commit final de integracion**

```bash
git add .
git commit -m "perf: improve overlay scalability for large user datasets"
```

## Notas de implementacion

- Mantener API publica de `MapBridge` y `useNostrOverlay` sin breaking changes.
- No cambiar copy/textos UI ni labels existentes.
- Evitar micro-optimizaciones prematuras fuera de estos tres puntos.
- Si alguna optimizacion exige trade-off visual, priorizar parity funcional y abrir follow-up separado.
