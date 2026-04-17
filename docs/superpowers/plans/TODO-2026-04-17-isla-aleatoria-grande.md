# Isla Aleatoria Grande Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar mapas donde la ciudad se construya siempre dentro de una isla grande con forma aleatoria en cada generacion.

**Architecture:** Separar la geometria de isla en un modulo puro (facil de testear), conectarlo al pipeline de agua para exponer `islandPolygon`, y cambiar la regla de `onLand` para que dependa de la isla (no del corte rectangular actual). Actualizar render para pintar mar como fondo + isla como tierra.

**Tech Stack:** TypeScript, Vitest, pipeline actual de `WaterGenerator`/`TensorField`/`Style`.

---

## Chunk 1: Geometria de isla (dominio puro)

### Task 1: Crear generador de poligono de isla aleatoria

**Files:**
- Create: `src/ts/impl/island_shape.ts`
- Test: `src/ts/impl/island_shape.test.ts`

- [ ] **Step 1: Escribir tests fallando**
  - Verificar que el poligono:
    - tiene >= N vertices,
    - es cerrado/coherente para dibujo,
    - queda dentro de `origin + worldDimensions`,
    - area minima grande (p.ej. >= 0.55 del rectangulo visible),
    - cambia entre ejecuciones con distinta fuente aleatoria.

- [ ] **Step 2: Ejecutar test y confirmar fallo**
  - Run: `pnpm vitest run src/ts/impl/island_shape.test.ts`
  - Expected: FAIL por modulo/funcion no implementada.

- [ ] **Step 3: Implementacion minima**
  - Funcion pura `generateIslandPolygon({ origin, worldDimensions, rng? })`.
  - Metodo radial alrededor del centro:
    - radio base grande (`~0.42 * min(width,height)`),
    - jitter por vertice (aleatorio),
    - suavizado simple para evitar picos.
  - Clampear vertices a bounds.

- [ ] **Step 4: Ejecutar tests**
  - Run: `pnpm vitest run src/ts/impl/island_shape.test.ts`
  - Expected: PASS.

## Chunk 2: Integracion en agua + rio

### Task 2: Usar isla en `WaterGenerator`

**Files:**
- Modify: `src/ts/impl/water_generator.ts`
- Modify: `src/ts/ui/water_gui.ts`
- Test: `src/ts/impl/water_generator.island.test.ts` (nuevo o extender tests existentes)

- [ ] **Step 1: Tests de integracion fallando**
  - `createCoast()` genera y expone `islandPolygon`.
  - `tensorField` recibe la isla para decisiones de terreno.
  - El rio termina saliendo de isla (o fallback seguro si no converge).

- [ ] **Step 2: Implementar**
  - Reemplazar logica rectangular de mar para modo isla.
  - Anadir `islandPolygon` en `WaterGenerator` y getter en `WaterGUI`.
  - Adaptar condicion de validez de rio: no "toca borde de pantalla", sino "sale de isla".

- [ ] **Step 3: Ejecutar tests**
  - Run: `pnpm vitest run src/ts/impl/water_generator.island.test.ts`
  - Expected: PASS.

## Chunk 3: Regla de terreno (land mask)

### Task 3: Cambiar `onLand` para usar isla

**Files:**
- Modify: `src/ts/impl/tensor_field.ts`
- Test: `src/ts/impl/tensor_field.island.test.ts` (nuevo)

- [ ] **Step 1: Tests fallando**
  - Punto dentro de isla y fuera de rio => `onLand=true`.
  - Punto fuera de isla => `onLand=false`.
  - Punto dentro de rio => `onLand=false`.

- [ ] **Step 2: Implementar minimo**
  - Anadir estado `island: Vector[]` y limpiar en `reset()`.
  - En `onLand`, priorizar mascara de isla cuando exista.
  - Mantener compatibilidad razonable con flujo actual si isla vacia.

- [ ] **Step 3: Ejecutar tests**
  - Run: `pnpm vitest run src/ts/impl/tensor_field.island.test.ts`
  - Expected: PASS.

## Chunk 4: Render/UI y etiqueta de agua

### Task 4: Pintar isla sobre mar y ajustar label

**Files:**
- Modify: `src/ts/ui/style.ts`
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/ts/ui/water_gui.ts`
- Test: `src/ts/ui/style-occupancy.test.ts` (ajustes)
- Test: `src/ts/ui/main_gui.traffic_zoom.test.ts` (ajustes de mocks si aplica)

- [ ] **Step 1: Tests/UI fallando**
  - El render no debe volver a "ciudad rectangular".
  - Sin errores al dibujar cuando `seaPolygon` ya no es la forma principal.

- [ ] **Step 2: Implementar**
  - Dibujar mar como fondo (`seaColour`) y luego isla como tierra (`bgColour`).
  - Costa se dibuja sobre el borde de la isla.
  - `createWaterLabel`: en esta pasada, desactivar label de agua si no hay poligono de mar explicito (evita etiquetas sobre tierra).

- [ ] **Step 3: Ejecutar tests**
  - Run: `pnpm vitest run src/ts/ui/style-occupancy.test.ts src/ts/ui/main_gui.traffic_zoom.test.ts`
  - Expected: PASS.

## Chunk 5: Verificacion final y smoke

### Task 5: Verificacion de regresion

**Files:**
- No new files (solo verificacion)

- [ ] **Step 1: Unit suite foco mapa**
  - Run: `pnpm vitest run src/ts/impl/island_shape.test.ts src/ts/impl/water_generator.island.test.ts src/ts/impl/tensor_field.island.test.ts`
  - Expected: PASS.

- [ ] **Step 2: Smoke e2e de carga mapa**
  - Run: `pnpm test:e2e -- tests/smoke/map-load.spec.ts` (o comando equivalente del repo)
  - Expected: PASS, mapa renderiza correctamente.

- [ ] **Step 3: Verificacion manual rapida**
  - Generar mapa varias veces desde UI.
  - Confirmar que cada isla cambia forma y mantiene tamano grande.

---

## Fuera de alcance (segunda pasada)

- `src/main.ts:420` + `src/ts/model_generator.ts` para export STL "isla-aware".
