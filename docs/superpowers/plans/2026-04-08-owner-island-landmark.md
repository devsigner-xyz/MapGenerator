# Owner Island Landmark Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar una isla fija en todos los mapas con un unico edificio reservado para `strhodlery`, y abrir un modal especial al hacer click en ese edificio.

**Architecture:** Se agrega una capa de dominio determinista para geometria de isla y huella del edificio, se integra en `WaterGenerator` + `TensorField` + pipeline de edificios, y se expone un contrato de API/click backward-compatible (`kind`). En overlay, se reserva ese indice fuera de la asignacion social y se enruta a un modal dedicado, sin romper el modal normal.

**Tech Stack:** TypeScript, Vitest, React 19, Vite, canvas 2D map engine.

---

## Skills To Use During Execution

- `@subagent-driven-development` (obligatorio en ejecucion con subagentes)
- `@test-driven-development` (failing test -> pass)
- `@systematic-debugging` (si aparece regresion o test flaky)
- `@verification-before-completion` (antes de declarar listo)

## File Structure

### Create

- `src/ts/impl/owner_island.ts`
  - Logica determinista para ubicar isla en mar y crear huella de edificio fallback-safe.
- `src/ts/impl/owner_island.test.ts`
  - Pruebas unitarias de posicionamiento, determinismo, area y fallbacks.
- `src/ts/impl/tensor_field.owner_island.test.ts`
  - Pruebas de semantica tierra/agua con isla dentro del mar.
- `src/nostr-overlay/domain/landmark-owner.ts`
  - Identidad fija del landmark (`username`, `npub`, `pubkeyHex`, avatar).
- `src/nostr-overlay/domain/landmark-owner.test.ts`
  - Validaciones de datos y decodificacion `npub`.
- `src/nostr/domain/landmark-occupancy.ts`
  - Composicion de ocupacion social + reserva de landmark sin colision de metricas.
- `src/nostr/domain/landmark-occupancy.test.ts`
  - Pruebas de exclusion de indice reservado y consistencia de contadores.
- `src/nostr-overlay/hooks/useNostrOverlay.owner_island.test.ts`
  - Pruebas de routing de estado para click `owner_island` vs `regular`.
- `src/nostr-overlay/components/OwnerIslandModal.tsx`
  - Modal especializado (avatar, username, npub).
- `src/nostr-overlay/components/OwnerIslandModal.test.tsx`
  - Render y cierre del modal.
- `src/ts/ui/buildings.owner_island.test.ts`
  - Cobertura de inyeccion unica de lote e indice reservado estable.
- `src/ts/ui/main_gui.owner_island.test.ts`
  - Cobertura de exposicion `getOwnerIslandBuildingIndex`.
- `src/ts/ui/style.owner_island.test.ts`
  - Cobertura de orden de capas y color fijo en `DefaultStyle` y `RoughStyle`.

### Modify

- `src/ts/impl/water_generator.ts`
  - Guardar `ownerIslandPolygon` y usar helper determinista.
- `src/ts/impl/tensor_field.ts`
  - Nueva propiedad `ownerIsland` y ajuste de `onLand`.
- `src/ts/ui/water_gui.ts`
  - Exponer isla en world/screen.
- `src/ts/ui/buildings.ts`
  - Inyectar lote unico de isla y exponer `ownerIslandBuildingIndex`.
- `src/ts/ui/main_gui.ts`
  - Pasar geometria isla a style, exponer `getOwnerIslandBuildingIndex`, y clasificar click kind.
- `src/ts/ui/style.ts`
  - Dibujar capa de isla verde en `DefaultStyle` y `RoughStyle`.
- `src/main.ts`
  - Extender payload click con `kind` y API getter de indice reservado.
- `src/nostr-overlay/map-bridge.ts`
  - Propagar `getOwnerIslandBuildingIndex` + `kind`.
- `src/nostr-overlay/map-bridge.test.ts`
  - Cobertura de delegaciones nuevas.
- `src/nostr-overlay/hooks/useNostrOverlay.ts`
  - Usar reserva de landmark en ocupacion y estado modal especial.
- `src/nostr-overlay/App.tsx`
  - Renderizar `OwnerIslandModal` y mantener `OccupantProfileModal` sin cambios.
- `src/nostr-overlay/App.test.tsx`
  - Cobertura click regular vs `owner_island`.
- `src/nostr-overlay/styles.css`
  - Estilos del modal nuevo.

## Chunk 1: Engine Domain + Map API Contracts

### Task 1: Crear dominio determinista de isla y huella

**Files:**
- Create: `src/ts/impl/owner_island.ts`
- Test: `src/ts/impl/owner_island.test.ts`

- [ ] **Step 1: Escribir tests unitarios en rojo para posicionamiento y determinismo**

```ts
test('selectOwnerIslandPolygon returns deterministic polygon for same sea input', () => {
  const first = selectOwnerIslandPolygon({ seaPolygon, worldOrigin, worldSize })
  const second = selectOwnerIslandPolygon({ seaPolygon, worldOrigin, worldSize })
  expect(first).toEqual(second)
})

test('buildOwnerIslandBuildingFootprint always returns one valid polygon', () => {
  const footprint = buildOwnerIslandBuildingFootprint(ownerIslandPolygon)
  expect(footprint.length).toBeGreaterThanOrEqual(3)
})

test('selected owner island polygon is fully inside sea polygon', () => {
  const island = selectOwnerIslandPolygon({ seaPolygon, worldOrigin, worldSize })
  expect(everyVertexInsidePolygon(island, seaPolygon)).toBe(true)
})

test('falls back deterministically when primary candidates are invalid', () => {
  const island = selectOwnerIslandPolygon({ seaPolygon: hardSeaPolygon, worldOrigin, worldSize })
  expect(island).toEqual(expectedFallbackIsland)
})

test('building footprint fallback returns valid polygon for degenerate island', () => {
  const footprint = buildOwnerIslandBuildingFootprint(degenerateIsland)
  expect(footprint.length).toBeGreaterThanOrEqual(3)
})
```

- [ ] **Step 2: Ejecutar tests para confirmar fallo**

Run: `pnpm test:unit src/ts/impl/owner_island.test.ts`
Expected: FAIL (modulo/funciones no existen).

- [ ] **Step 3: Implementar version minima en `owner_island.ts`**

```ts
export function selectOwnerIslandPolygon(input: SelectOwnerIslandInput): Vector[] { /* candidatos deterministas */ }
export function buildOwnerIslandBuildingFootprint(ownerIsland: Vector[]): Vector[] { /* fallback obligatorio */ }
```

- [ ] **Step 4: Re-ejecutar test unitario**

Run: `pnpm test:unit src/ts/impl/owner_island.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ts/impl/owner_island.ts src/ts/impl/owner_island.test.ts
git commit -m "feat: add deterministic owner island geometry domain"
```

### Task 2: Integrar isla en agua/tierra del motor

**Files:**
- Modify: `src/ts/impl/water_generator.ts`
- Modify: `src/ts/impl/tensor_field.ts`
- Modify: `src/ts/ui/water_gui.ts`
- Create: `src/ts/impl/tensor_field.owner_island.test.ts`
- Test: `src/ts/impl/owner_island.test.ts`

- [ ] **Step 1: Escribir test en rojo para `onLand` con isla**

```ts
test('onLand returns true inside ownerIsland even when inside sea', () => {
  field.sea = seaPolygon
  field.ownerIsland = islandPolygon
  expect(field.onLand(pointInsideIsland)).toBe(true)
})
```

- [ ] **Step 2: Ejecutar test para confirmar fallo**

Run: `pnpm test:unit src/ts/impl/tensor_field.owner_island.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar integracion minima**

Cambios esperados:
- `WaterGenerator.createCoast()` calcula y guarda `ownerIslandPolygon`.
- `TensorField` agrega `ownerIsland` y prioridad en `onLand`.
- `WaterGUI` expone getter `ownerIsland` en screen-space.

- [ ] **Step 4: Ejecutar tests del dominio del motor**

Run: `pnpm test:unit src/ts/impl/owner_island.test.ts src/ts/impl/tensor_field.owner_island.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ts/impl/water_generator.ts src/ts/impl/tensor_field.ts src/ts/ui/water_gui.ts src/ts/impl/tensor_field.owner_island.test.ts
git commit -m "feat: treat owner island as land in water pipeline"
```

### Task 3: Inyectar lote unico reservado de isla

**Files:**
- Modify: `src/ts/ui/buildings.ts`
- Modify: `src/ts/ui/main_gui.ts`
- Create: `src/ts/ui/buildings.owner_island.test.ts`
- Create: `src/ts/ui/main_gui.owner_island.test.ts`

- [ ] **Step 1: Escribir test en rojo para indice reservado estable**

```ts
test('owner island lot is appended once and exposes stable index', () => {
  const result = appendIslandLot(baseLots, ownerIslandPolygon)
  expect(result.ownerIslandBuildingIndex).toBe(result.lots.length - 1)
})

test('owner island lot is appended exactly once across regenerate flow', () => {
  const once = appendIslandLot(baseLots, ownerIslandPolygon)
  const twice = appendIslandLot(once.lots, ownerIslandPolygon)
  expect(twice.lots.length).toBe(once.lots.length)
})
```

- [ ] **Step 2: Ejecutar test en rojo**

Run: `pnpm test:unit src/ts/ui/buildings.owner_island.test.ts src/ts/ui/main_gui.owner_island.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar inyeccion minima en pipeline de edificios**

Cambios esperados:
- `Buildings.generate()` agrega footprint de isla al final.
- `Buildings` expone `ownerIslandBuildingIndex?: number`.
- `MainGUI` expone getter `getOwnerIslandBuildingIndex()`.

- [ ] **Step 4: Ejecutar tests de hit-test y building index**

Run: `pnpm test:unit src/ts/ui/buildings.owner_island.test.ts src/ts/ui/main_gui.owner_island.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ts/ui/buildings.ts src/ts/ui/main_gui.ts src/ts/ui/buildings.owner_island.test.ts src/ts/ui/main_gui.owner_island.test.ts
git commit -m "feat: add reserved owner island building index"
```

### Task 4: Extender contrato de click/API con `kind`

**Files:**
- Modify: `src/main.ts`
- Modify: `src/nostr-overlay/map-bridge.ts`
- Modify: `src/nostr-overlay/map-bridge.test.ts`

- [ ] **Step 1: Escribir test en rojo para payload backward-compatible**

```ts
test('onOccupiedBuildingClick forwards kind owner_island', () => {
  // stub emits { buildingIndex, pubkey, kind: 'owner_island' }
  // expect bridge listener receives kind
})

test('legacy payload without kind behaves as regular', () => {
  // stub emits { buildingIndex, pubkey }
  // expect consumer receives kind: 'regular'
})

test('bridge delegates getOwnerIslandBuildingIndex', () => {
  // api returns 7
  // expect bridge getter to return 7
})
```

- [ ] **Step 2: Ejecutar test en rojo**

Run: `pnpm test:unit src/nostr-overlay/map-bridge.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar cambios minimos de contrato**

Cambios esperados:
- `OccupiedBuildingClickPayload` en `main.ts` incluye `kind?: 'regular' | 'owner_island'`.
- `notifyOccupiedBuildingClick` envia `kind` segun `ownerIslandBuildingIndex`.
- En frontera de contrato, normalizar `kind` con `kind ?? 'regular'`.
- `MapMainApi` / `MapBridge` propagan `kind` y `getOwnerIslandBuildingIndex`.

- [ ] **Step 4: Re-ejecutar tests del bridge**

Run: `pnpm test:unit src/nostr-overlay/map-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/nostr-overlay/map-bridge.ts src/nostr-overlay/map-bridge.test.ts
git commit -m "feat: expose owner island click kind through map bridge"
```

## Chunk 2: Overlay Occupancy + Specialized Modal

### Task 5: Crear identidad fija de landmark

**Files:**
- Create: `src/nostr-overlay/domain/landmark-owner.ts`
- Test: `src/nostr-overlay/domain/landmark-owner.test.ts`

- [ ] **Step 1: Escribir test en rojo para datos fijos + decode npub**

```ts
test('landmark owner exports fixed npub and decodes pubkey hex', () => {
  expect(LANDMARK_OWNER.npub).toBe('npub1dd3k7ku95jhpyh9y7pgx9qrh2ykvtfl5lnncqzzt2gyhgw0a04ysm4paad')
  expect(LANDMARK_OWNER.pubkeyHex).toMatch(/^[a-f0-9]{64}$/)
})

test('decode failure uses deterministic pubkey fallback and does not throw', async () => {
  vi.resetModules()
  vi.doMock('../../nostr/npub', () => ({
    decodeNpubToHex: () => { throw new Error('decode failed') }
  }))
  const mod = await import('./landmark-owner')
  expect(mod.LANDMARK_OWNER.npub).toBe('npub1dd3k7ku95jhpyh9y7pgx9qrh2ykvtfl5lnncqzzt2gyhgw0a04ysm4paad')
  expect(mod.LANDMARK_OWNER.pubkeyHex).toMatch(/^[a-f0-9]{64}$/)
  vi.doUnmock('../../nostr/npub')
})
```

- [ ] **Step 2: Ejecutar test en rojo**

Run: `pnpm test:unit src/nostr-overlay/domain/landmark-owner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar constantes y fallback avatar**

```ts
export const LANDMARK_OWNER = {
  username: 'strhodlery',
  npub: 'npub1dd3k7ku95jhpyh9y7pgx9qrh2ykvtfl5lnncqzzt2gyhgw0a04ysm4paad',
  pubkeyHex: decodeNpubToHex(...),
  avatarUrl: ''
}
```

Con `try/catch` para decode y fallback no bloqueante si falla.

- [ ] **Step 4: Re-ejecutar test**

Run: `pnpm test:unit src/nostr-overlay/domain/landmark-owner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/domain/landmark-owner.ts src/nostr-overlay/domain/landmark-owner.test.ts
git commit -m "feat: add fixed landmark owner identity"
```

### Task 6: Componer ocupacion social + reserva landmark

**Files:**
- Create: `src/nostr/domain/landmark-occupancy.ts`
- Test: `src/nostr/domain/landmark-occupancy.test.ts`
- Create: `src/nostr-overlay/hooks/useNostrOverlay.owner_island.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [ ] **Step 1: Escribir tests en rojo para reserva + routing de click**

```ts
test('applyLandmarkReservation excludes reserved index from social assignment', () => {
  const out = applyLandmarkReservation({ occupancy, reservedBuildingIndex: 3, landmarkPubkey })
  expect(out.byBuildingIndex[3]).toBe(landmarkPubkey)
  expect(Object.values(out.byBuildingIndex).filter(v => v === landmarkPubkey)).toHaveLength(1)
})

test('owner_island click sets owner-island modal state and not active profile state', () => {
  // hook test: emit click payload with kind owner_island
  // expect owner-island modal state true
  // expect activeProfilePubkey undefined
})

test('regular click keeps active profile state behavior', () => {
  // hook test: emit kind regular
  // expect activeProfilePubkey set
})
```

- [ ] **Step 2: Ejecutar test en rojo**

Run: `pnpm test:unit src/nostr/domain/landmark-occupancy.test.ts src/nostr-overlay/hooks/useNostrOverlay.owner_island.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar helper y conectar en hook**

Cambios esperados en `useNostrOverlay`:
- leer `reservedBuildingIndex` desde `mapBridge.getOwnerIslandBuildingIndex?.()`
- aplicar helper antes de `mapBridge.applyOccupancy(...)`
- mantener metricas sociales sin contar landmark
- conservar state.data.assignments como fuente de metricas sociales; crear un objeto de ocupacion solo-visual (con landmark reservado) exclusivamente para mapBridge.applyOccupancy(...)
- al click: usar `kind` como regla primaria; si `kind` falta, usar respaldo por `buildingIndex === mapBridge.getOwnerIslandBuildingIndex?.()`
- `owner_island` abre estado de modal especial; `regular` mantiene active profile modal normal

- [ ] **Step 4: Ejecutar tests del dominio + overlay relacionados**

Run: `pnpm test:unit src/nostr/domain/landmark-occupancy.test.ts src/nostr-overlay/hooks/useNostrOverlay.owner_island.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr/domain/landmark-occupancy.ts src/nostr/domain/landmark-occupancy.test.ts src/nostr-overlay/hooks/useNostrOverlay.owner_island.test.ts src/nostr-overlay/hooks/useNostrOverlay.ts
git commit -m "feat: reserve owner island occupancy outside social assignments"
```

### Task 7: Implementar modal especializado de isla

**Files:**
- Create: `src/nostr-overlay/components/OwnerIslandModal.tsx`
- Create: `src/nostr-overlay/components/OwnerIslandModal.test.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] **Step 1: Escribir test en rojo del modal (render + fallback + close)**

```tsx
test('renders owner island modal with avatar, username and npub', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<OwnerIslandModal username="strhodlery" npub="npub1dd3k7..." avatarUrl="" onClose={() => {}} />)
  })
  expect(container.textContent).toContain('strhodlery')
  expect(container.textContent).toContain('npub1dd3k7')
})

test('shows avatar fallback and closes on close button', () => {
  const onClose = vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<OwnerIslandModal username="strhodlery" npub="npub1dd3k7..." avatarUrl="" onClose={onClose} />)
  })
  expect(container.textContent).toContain('ST')
  const button = container.querySelector('button[aria-label="Cerrar modal"]') as HTMLButtonElement
  act(() => {
    button.click()
  })
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('App shows OwnerIslandModal for owner_island click and keeps OccupantProfileModal hidden', () => {
  // App integration test using mapBridge stub emitting kind owner_island
  // expect OwnerIslandModal content present
  // expect OccupantProfileModal content absent
})
```

- [ ] **Step 2: Ejecutar test en rojo**

Run: `pnpm test:unit src/nostr-overlay/components/OwnerIslandModal.test.tsx src/nostr-overlay/App.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar componente y wiring en App**

Cambios esperados:
- Nuevo modal con close button + fallback de avatar.
- `App.tsx` renderiza `OwnerIslandModal` cuando el estado especial este activo.
- `OccupantProfileModal` se mantiene para `kind === 'regular'`.

- [ ] **Step 4: Ejecutar tests de App y modal**

Run: `pnpm test:unit src/nostr-overlay/components/OwnerIslandModal.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/components/OwnerIslandModal.tsx src/nostr-overlay/components/OwnerIslandModal.test.tsx src/nostr-overlay/App.tsx src/nostr-overlay/styles.css src/nostr-overlay/App.test.tsx
git commit -m "feat: add dedicated owner island profile modal"
```

## Chunk 3: Rendering + Verification + Docs

### Task 8: Dibujar isla verde en ambos estilos

**Files:**
- Modify: `src/ts/ui/style.ts`
- Modify: `src/ts/ui/main_gui.ts`
- Create: `src/ts/ui/style.owner_island.test.ts`

- [ ] **Step 1: Escribir test en rojo para capa owner island**

```ts
test('DefaultStyle draws owner island between water and lots using fixed green', () => {
  const calls: string[] = []
  const fakeCanvas = {
    lastOwnerIslandFill: '',
    setFillStyle: (value: string) => {
      fakeCanvas.lastOwnerIslandFill = value
    },
    drawPolygon: (_poly: unknown) => {
      if (calls.length === 0) calls.push('water')
      else if (calls.length === 1) calls.push('ownerIsland')
      else if (calls.length === 2) calls.push('parksRoads')
      else calls.push('buildings')
    },
    setStrokeStyle: () => {},
    setLineWidth: () => {},
    drawPolyline: () => {},
    clearCanvas: () => {},
    drawFrame: () => {},
    needsUpdate: false,
    canvasScale: 1,
  }
  const style = createDefaultStyleWithFakeCanvas(fakeCanvas as any)
  style.seaPolygon = [seaPoly]
  style.ownerIslandPolygon = [islandPoly]
  style.parks = [parkPoly]
  style.minorRoads = [minorRoad]
  style.lots = [lotPoly]
  style.draw()
  expect(calls).toEqual(['water', 'ownerIsland', 'parksRoads', 'buildings'])
  expect(fakeCanvas.lastOwnerIslandFill).toBe('rgb(104,176,92)')
})

test('RoughStyle draws owner island with the same layer order and fixed green', () => {
  const calls: string[] = []
  const fakeCanvas = {
    lastOwnerIslandFill: '',
    setFillStyle: (value: string) => {
      fakeCanvas.lastOwnerIslandFill = value
    },
    drawPolygon: (_poly: unknown) => {
      if (calls.length === 0) calls.push('water')
      else if (calls.length === 1) calls.push('ownerIsland')
      else if (calls.length === 2) calls.push('parksRoads')
      else calls.push('buildings')
    },
    setStrokeStyle: () => {},
    setLineWidth: () => {},
    drawPolyline: () => {},
    clearCanvas: () => {},
    drawFrame: () => {},
    needsUpdate: false,
    canvasScale: 1,
  }
  const style = createRoughStyleWithFakeCanvas(fakeCanvas as any)
  style.seaPolygon = [seaPoly]
  style.ownerIslandPolygon = [islandPoly]
  style.parks = [parkPoly]
  style.mainRoads = [mainRoad]
  style.lots = [lotPoly]
  style.draw()
  expect(calls).toEqual(['water', 'ownerIsland', 'parksRoads', 'buildings'])
  expect(fakeCanvas.lastOwnerIslandFill).toBe('rgb(104,176,92)')
})
```

- [ ] **Step 2: Ejecutar test en rojo**

Run: `pnpm test:unit src/ts/ui/style.owner_island.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar draw data + orden de capas**

Cambios esperados:
- Nuevo campo de style data para `ownerIslandPolygon`.
- Draw order: water -> owner island (verde) -> roads/parks -> buildings.
- Cobertura en `DefaultStyle` y `RoughStyle`.
- `MainGUI` pasa `ownerIslandPolygon` en render normal y en rutas de export (`PNG`, `SVG`, `Heightmap`).

- [ ] **Step 4: Ejecutar test de style**

Run: `pnpm test:unit src/ts/ui/style.owner_island.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ts/ui/style.ts src/ts/ui/main_gui.ts src/ts/ui/style.owner_island.test.ts
git commit -m "feat: render owner island landmark layer in map styles"
```

### Task 9: Verificacion final integral

**Files:**
- Modify (if needed): `docs/superpowers/specs/2026-04-08-owner-island-follow-landmark-design.md`
- Modify (if needed): `docs/superpowers/plans/2026-04-08-owner-island-landmark.md`

- [ ] **Step 1: Ejecutar suite de pruebas objetivo**

Run: `pnpm test:unit src/ts/impl/owner_island.test.ts src/ts/impl/tensor_field.owner_island.test.ts src/nostr-overlay/domain/landmark-owner.test.ts src/nostr/domain/landmark-occupancy.test.ts src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/App.test.tsx src/ts/ui/style.owner_island.test.ts src/ts/ui/buildings.owner_island.test.ts src/ts/ui/main_gui.owner_island.test.ts src/ts/ui/occupied_building_hit.test.ts`
Expected: PASS.

- [ ] **Step 2: Ejecutar verificacion de proyecto**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS en los tres comandos.

- [ ] **Step 3: QA manual minima**

Checklist:
- regenerar mapa 5 veces y verificar isla mediana en agua
- verificar que la isla siempre tiene verde visible
- verificar que existe un unico edificio en isla
- click owner island abre modal especial con avatar/username/npub fijo
- verificar que el edificio de isla siempre queda ocupado por la identidad fija landmark (no reasignado por follows)
- click edificios normales abre modal normal
- verificar exportaciones `PNG`, `SVG`, `Heightmap` con orden de capas correcto
- no hay regresiones visuales de ocupacion

- [ ] **Step 4: Commit final de cierre**

```bash
git add -A
git commit -m "feat: add persistent owner island landmark and special profile modal"
```
