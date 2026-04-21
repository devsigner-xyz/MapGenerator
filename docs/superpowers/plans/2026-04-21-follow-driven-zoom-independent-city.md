# Follow-Driven Zoom-Independent City Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que la ciudad se regenere en función del número de cuentas seguidas por el usuario y que la generación procedural deje de depender del `zoom` actual.

**Architecture:** El overlay calculará una `targetBuildings` desde `follows` y la pasará al mapa mediante un contrato explícito de regeneración. `Main.generateMap()` resolverá un `GenerationBounds` independiente del `zoom`, recalculará el tensor field para ese intento y ejecutará una calibración corta hasta acercar el número de edificios a una banda aceptable.

**Tech Stack:** TypeScript, React 19, Vitest, dat.GUI, generador procedural existente (`TensorFieldGUI`, `RoadGUI`, `WaterGUI`, `MainGUI`).

---

## File Structure (locked before tasks)

### Create

- `src/map-generation-options.ts`
  - Contrato compartido `MapGenerationOptions` para pedir regeneraciones con `targetBuildings`.
- `src/nostr-overlay/domain/map-generation-target.ts`
  - Helper puro para convertir `follows` en una `targetBuildings` estable.
- `src/nostr-overlay/domain/map-generation-target.test.ts`
  - Tests del cálculo del objetivo y sus buffers.
- `src/ts/ui/map_generation_context.ts`
  - Helper puro para construir `GenerationBounds`, inflación explícita, banda de aceptación, retune y selección del mejor intento del bucle de calibración.
- `src/ts/ui/map_generation_context.test.ts`
  - Tests del helper de contexto y calibración.
- `src/nostr-overlay/App.map-generation.test.tsx`
  - Tests de integración focalizados del wiring entre `follows` y `regenerateMap({ targetBuildings })`.
- `src/main.generateMap.test.ts`
  - Tests focalizados de la orquestación final: publicación única del intento elegido y protección frente a solicitudes obsoletas.
- `src/ts/ui/map_generation_request_guard.ts`
  - Helper pequeño para request id monotónico y validación de publicación vigente.
- `src/ts/ui/map_generation_request_guard.test.ts`
  - Tests del guard de solicitudes obsoletas.
- `src/ts/ui/tensor_field_gui.generation.test.ts`
  - Tests directos de `setRecommended(bounds)` independientes del `zoom`.
- `src/ts/ui/main_gui.generation_context.test.ts`
  - Tests focalizados de propagación de `GenerationBounds` y eliminación de la dependencia del `zoom`.

### Modify

- `src/nostr-overlay/map-bridge.ts`
  - Aceptar `MapGenerationOptions` en la regeneración del mapa.
- `src/nostr-overlay/map-bridge.test.ts`
  - Cubrir la delegación del nuevo contrato.
- `src/nostr-overlay/hooks/useNostrOverlay.ts`
  - Calcular `targetBuildings` desde `follows`.
  - Usar `regenerateMap({ targetBuildings })` en la carga autenticada y en la regeneración manual.
- `src/main.ts`
  - Aceptar `MapGenerationOptions` en `generateMap()`.
  - Resolver `GenerationBounds` base y ejecutar la calibración por intentos.
  - Recalcular el tensor field con bounds explícitos.
  - Ignorar la publicación de intentos obsoletos si llega una solicitud más nueva.
- `src/ts/ui/map_generation_request_guard.ts`
  - Encapsular el guard de solicitud vigente para que `main.ts` no absorba también esa responsabilidad.
- `src/ts/ui/tensor_field_gui.ts`
  - Hacer que `setRecommended()` reciba `GenerationBounds`.
- `src/ts/ui/main_gui.ts`
  - Hacer que `generateEverything()` reciba `GenerationBounds` y los propague.
- `src/ts/ui/road_gui.ts`
  - Hacer que `generateRoads()` reciba bounds explícitos.
  - Sustituir el hack de zoom por inflación explícita.
  - Recalcular `pathIterations` usando el mundo procedural del intento.
- `src/ts/ui/water_gui.ts`
  - Igual que `RoadGUI`, pero para water.
- `src/ts/ui/main_gui.traffic_zoom.test.ts`
  - Mantener o ajustar mocks si el nuevo contrato de `generateRoads(bounds)` lo requiere.

---

## Chunk 1: Shared contract + follow-driven target wiring

### Task 1: RED para el contrato compartido de regeneración

**Files:**
- Modify: `src/nostr-overlay/map-bridge.test.ts`

- [ ] **Step 1: Escribir tests RED para `regenerateMap(options)`**

Casos:
- `bridge.regenerateMap({ targetBuildings: 80 })` delega exactamente ese objeto a `mainApi.generateMap()`
- `bridge.regenerateMap()` sin opciones llama a `mainApi.generateMap(undefined)`

- [ ] **Step 2: Ejecutar RED del contrato del bridge**

Run: `pnpm vitest run src/nostr-overlay/map-bridge.test.ts`
Expected: FAIL porque `regenerateMap(options)` aún no acepta ni delega `targetBuildings`.

### Task 2: Implementar el contrato compartido `MapGenerationOptions`

**Files:**
- Create: `src/map-generation-options.ts`
- Modify: `src/nostr-overlay/map-bridge.ts`

- [ ] **Step 3: Crear el tipo compartido `MapGenerationOptions`**

Objetivo:

```ts
export interface MapGenerationOptions {
    targetBuildings?: number;
}
```

- [ ] **Step 4: Conectar `MapGenerationOptions` en `map-bridge.ts`**

Objetivo:
- `MapMainApi.generateMap(options?: MapGenerationOptions)`
- `MapBridge.regenerateMap(options?: MapGenerationOptions)`
- `createMapBridge()` reenvía el objeto a `mainApi.generateMap(options)`

- [ ] **Step 5: Ejecutar GREEN del contrato del bridge**

Run: `pnpm vitest run src/nostr-overlay/map-bridge.test.ts`
Expected: PASS.

### Task 3: RED para el cálculo del objetivo desde `follows`

**Files:**
- Create: `src/nostr-overlay/domain/map-generation-target.test.ts`

- [ ] **Step 6: Escribir tests RED del helper de objetivo**

Casos:
- `[]` devuelve exactamente `600`
- al aumentar `follows`, aumenta `targetBuildings`
- al disminuir `follows`, disminuye `targetBuildings`
- `['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']` devuelve exactamente `600`
- `50` `follows` únicos devuelven exactamente `600`
- `['AA', ' aa ', 'Aa']` o fixture equivalente normalizado cuenta como un solo follow tras trim + lowercase
- `['', '  ', 'Alice', 'alice']` o fixture equivalente descarta entradas vacías y cuenta un solo follow válido
- una lista muy grande de `follows` sigue creciendo por encima del suelo de `600`
- deduplica `follows` repetidos
- siempre devuelve un valor mayor que el número de `follows` deduplicados

- [ ] **Step 7: Ejecutar RED del helper de objetivo**

Run: `pnpm vitest run src/nostr-overlay/domain/map-generation-target.test.ts`
Expected: FAIL porque el helper aún no existe.

### Task 4: Implementar el helper `map-generation-target`

**Files:**
- Create: `src/nostr-overlay/domain/map-generation-target.ts`

- [ ] **Step 8: Crear la función pura de cálculo del objetivo**

Objetivo:

```ts
export function buildFollowDrivenTargetBuildings(input: {
    follows: string[];
}): number
```

- [ ] **Step 9: Implementar la fórmula acordada**

Contrato:
- `followedResidentCount = dedupe(follows).length`
- normalizar antes con `trim().toLowerCase()`
- descartar entradas vacías tras la normalización
- `systemBuffer = 8`
- `emptyHeadroom = Math.max(6, Math.ceil(followedResidentCount * 0.15))`
- `targetBuildings = Math.max(600, followedResidentCount + systemBuffer + emptyHeadroom)`

- [ ] **Step 10: Ejecutar GREEN del helper de objetivo**

Run: `pnpm vitest run src/nostr-overlay/domain/map-generation-target.test.ts`
Expected: PASS.

### Task 5: RED para la carga autenticada y la regeneración manual

**Files:**
- Create: `src/nostr-overlay/App.map-generation.test.tsx`

- [ ] **Step 11: Escribir tests RED de integración del overlay**

Casos:
- la carga autenticada usa `mapBridge.regenerateMap({ targetBuildings })` después de resolver `follows`
- la carga autenticada ya no llama a `mapBridge.ensureGenerated()` en ese path
- la carga autenticada dispara exactamente una llamada a `regenerateMap({ targetBuildings })` por carga de `follows`
- un fixture con `['a'.repeat(64)]` produce `targetBuildings = 600`
- un fixture con `50` `follows` únicos produce `targetBuildings = 600`
- el botón de `Regenerar mapa` reutiliza el `follows` más reciente del estado
- dos regeneraciones manuales con esos dos estados producen exactamente `600` y `600`
- seguir o dejar de seguir una cuenta no dispara `regenerateMap()` automáticamente en caliente

- [ ] **Step 12: Ejecutar RED de integración del overlay**

Run: `pnpm vitest run src/nostr-overlay/App.map-generation.test.tsx`
Expected: FAIL porque `useNostrOverlay` todavía usa el flujo antiguo.

### Task 6: Implementar el wiring del overlay hacia `regenerateMap({ targetBuildings })`

**Files:**
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [ ] **Step 13: Importar el helper `buildFollowDrivenTargetBuildings()`**

Objetivo:
- calcular `targetBuildings` desde `follows`
- mantener separada la métrica por seguidos del buffer técnico del mapa

- [ ] **Step 14: Sustituir la carga autenticada para usar `regenerateMap({ targetBuildings })`**

Objetivo:
- reemplazar la dependencia de `mapBridge.ensureGenerated()` en la ruta autenticada
- regenerar explícitamente el mapa calibrado a la red seguida

- [ ] **Step 15: Hacer que la regeneración manual reutilice el mismo objetivo**

Objetivo:
- en `regenerateMap`, usar `current.data.follows`
- calcular de nuevo `targetBuildings`
- llamar a `mapBridge.regenerateMap({ targetBuildings })`

- [ ] **Step 16: Mantener el follow/unfollow sin regeneración automática**

Objetivo:
- no añadir llamadas nuevas a `regenerateMap()` dentro de `followPerson()`
- dejar el redimensionado de ciudad para recarga, reconexión o regeneración manual

- [ ] **Step 17: Ejecutar GREEN del Chunk 1**

Run: `pnpm vitest run src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/domain/map-generation-target.test.ts src/nostr-overlay/App.map-generation.test.tsx`
Expected: PASS en los tests nuevos del contrato y del wiring por `follows`.

- [ ] **Step 18: Ejecutar una comprobación amplia del overlay tras el wiring del Chunk 1**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: PASS en la suite existente del overlay.

## Chunk 2: Zoom-independent generation context

### Task 7: RED para el helper de contexto de generación

**Files:**
- Create: `src/ts/ui/map_generation_context.test.ts`

- [ ] **Step 19: Escribir tests RED del helper puro de contexto**

Casos:
- con el mismo centro visual y distinto `zoom`, el `baseWorldDimensions` calculado no cambia
- `inflateGenerationBounds()` aplica `Util.DRAW_INFLATE_AMOUNT` sin tocar el `zoom`
- `buildAcceptanceBand(targetBuildings)` devuelve el rango esperado
- con `targetBuildings = 64`, `resolveInitialGenerationBounds(...)` produce el mismo baseline sin distorsión adicional
- `retuneGenerationBounds()` usa la raíz cuadrada del error para ajustar escala
- con `actualBuildings = 0`, el retune usa `Math.max(1, actualBuildings)` para evitar división infinita
- el helper de calibración se detiene al entrar en banda sin agotar intentos innecesarios
- el helper de calibración nunca supera `4` intentos
- si ningún intento entra en banda, conserva el mejor intento
- en empate entre intentos igual de cercanos, prefiere el no deficitario
- `targetBuildings` inválido cae en modo base sin explotar

- [ ] **Step 20: Ejecutar RED del helper de contexto**

Run: `pnpm vitest run src/ts/ui/map_generation_context.test.ts`
Expected: FAIL porque el helper aún no existe.

### Task 8: Implementar `map_generation_context.ts`

**Files:**
- Create: `src/ts/ui/map_generation_context.ts`

- [ ] **Step 21: Crear los tipos del helper de contexto**

Objetivo mínimo:

```ts
export interface GenerationBounds {
    origin: Vector;
    worldDimensions: Vector;
}
```

- [ ] **Step 22: Implementar el cálculo del mundo base independiente del `zoom`**

Contrato:
- usar `screenDimensions` como baseline físico
- usar el centro visual actual solo para posicionar `origin`
- no usar `domainController.worldDimensions` para escalar el tamaño del intento
- añadir `resolveInitialGenerationBounds(...)` con `baseTargetBuildings = 64`
- normalizar `targetBuildings` inválido a modo base
- para objetivos válidos, aplicar exactamente `scale = sqrt(targetBuildings / baseTargetBuildings)` y `worldDimensions = baseWorldDimensions * scale`

- [ ] **Step 23: Implementar inflación explícita y banda de aceptación**

Contrato:
- helper puro para inflar bounds por `DRAW_INFLATE_AMOUNT`
- helper puro para `min/max` aceptables alrededor de `targetBuildings`
- lower bound exacto: `targetBuildings`
- upper bound exacto: `targetBuildings + Math.max(6, Math.ceil(targetBuildings * 0.2))`

- [ ] **Step 24: Implementar el retune por intentos**

Contrato:
- `errorRatio = target / actual`
- `nextScale = sqrt(errorRatio)`
- mantener los bounds centrados en el mismo `viewCenter`

- [ ] **Step 25: Implementar el helper del bucle de calibración y selección del mejor intento**

Contrato:
- parar al entrar en banda
- nunca superar `4` intentos
- conservar el mejor intento si todos fallan
- preferir el no deficitario en empate

- [ ] **Step 26: Ejecutar GREEN del helper de contexto**

Run: `pnpm vitest run src/ts/ui/map_generation_context.test.ts`
Expected: PASS.

### Task 9: RED para la propagación de `GenerationBounds`

**Files:**
- Create: `src/ts/ui/main_gui.generation_context.test.ts`
- Create: `src/ts/ui/tensor_field_gui.generation.test.ts`
- Modify: `src/ts/ui/main_gui.traffic_zoom.test.ts`

- [ ] **Step 27: Escribir tests RED de `MainGUI` con mocks de roads/water/buildings**

Casos:
- `MainGUI.generateEverything(bounds)` pasa el mismo `bounds` a `WaterGUI.generateRoads(bounds)`
- `MainGUI.generateEverything(bounds)` pasa el mismo `bounds` a `RoadGUI.generateRoads(bounds)` para main/major/minor
- `TensorFieldGUI.setRecommended(bounds)` usa `GenerationBounds` y no el `zoom` actual para recomendar el tensor field
- distintos `bounds.worldDimensions` recalculan `pathIterations` con valores distintos sin depender del tamaño del viewport como sizing procedural principal
- `RoadGUI` usa exactamente `pathIterations = (1.5 * Math.max(worldDimensions.x, worldDimensions.y)) / dstep`
- `WaterGUI` reutiliza esa misma fórmula a través de la lógica compartida del base class
- los mocks no requieren mutar `domainController.zoom` para producir el intento
- `RoadGUI` y `WaterGUI` dejan `domainController.zoom` inalterado antes y después de generar
- `main_gui.traffic_zoom.test.ts` debe seguir verificando que la simulación de tráfico no se clampa al viewport; solo se actualizan sus mocks para aceptar el nuevo contrato de generación

- [ ] **Step 28: Ejecutar RED de propagación de bounds**

Run: `pnpm vitest run src/ts/ui/main_gui.generation_context.test.ts src/ts/ui/main_gui.traffic_zoom.test.ts`
Expected: FAIL porque `generateEverything(bounds)` y `generateRoads(bounds)` aún no existen.

- [ ] **Step 29: Escribir tests RED directos de `TensorFieldGUI.setRecommended(bounds)`**

Casos:
- con los mismos `GenerationBounds` y dos `zoom` distintos, la recomendación del tensor field es equivalente
- `setRecommended(bounds)` usa `bounds.origin/worldDimensions` y no vuelve a leer `domainController.worldDimensions` para dimensionar el intento

- [ ] **Step 30: Ejecutar RED directo de `TensorFieldGUI`**

Run: `pnpm vitest run src/ts/ui/tensor_field_gui.generation.test.ts`
Expected: FAIL porque `setRecommended(bounds)` aún no existe.

### Task 10: Adaptar `TensorFieldGUI`, `MainGUI`, `RoadGUI` y `WaterGUI`

**Files:**
- Modify: `src/ts/ui/tensor_field_gui.ts`
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/ts/ui/road_gui.ts`
- Modify: `src/ts/ui/water_gui.ts`

- [ ] **Step 31: Hacer que `TensorFieldGUI.setRecommended()` acepte `GenerationBounds`**

Objetivo:
- usar `bounds.worldDimensions` y `bounds.origin` para colocar grids/radiales
- firma objetivo exacta: `setRecommended(bounds?: GenerationBounds): void`
- cuando no reciba `bounds`, la acción manual de dat.GUI debe resolver un `GenerationBounds` base zoom-independiente mediante el helper y usarlo como fallback

- [ ] **Step 32: Hacer que `MainGUI.generateEverything(bounds)` propague esos bounds**

Objetivo:
- firma objetivo exacta: `generateEverything(bounds: GenerationBounds): Promise<void>`
- llamar a `this.coastline.generateRoads(bounds)`
- llamar a `this.mainRoads.generateRoads(bounds, this.animate)`
- llamar a `this.majorRoads.generateRoads(bounds, this.animate)`
- llamar a `this.minorRoads.generateRoads(bounds, this.animate)`
- mantener intacta la parte de buildings, parks y asignaciones posteriores

- [ ] **Step 33: Sustituir el hack de zoom en `RoadGUI.generateRoads()`**

Objetivo:
- firma objetivo exacta: `generateRoads(bounds?: GenerationBounds, animate = false): Promise<unknown>`
- construir `inflatedBounds` explícitos
- instanciar `StreamlineGenerator` con esos bounds
- no leer `domainController.origin/worldDimensions` para el intento
- no mutar `domainController.zoom` dentro de la generación
- aplicar exactamente `pathIterations = (1.5 * Math.max(worldDimensions.x, worldDimensions.y)) / dstep`

- [ ] **Step 34: Aplicar el mismo patrón en `WaterGUI.generateRoads()`**

Objetivo:
- firma objetivo exacta: `generateRoads(bounds?: GenerationBounds): Promise<void>`
- instanciar `WaterGenerator` con bounds explícitos
- eliminar la mutación temporal del zoom
- reutilizar exactamente la misma fórmula de `pathIterations` del base class

- [ ] **Step 35: Ejecutar GREEN del Chunk 2**

Run: `pnpm vitest run src/ts/ui/map_generation_context.test.ts src/ts/ui/main_gui.generation_context.test.ts src/ts/ui/tensor_field_gui.generation.test.ts src/ts/ui/main_gui.traffic_zoom.test.ts`
Expected: PASS en el helper y en los tests de propagación del contexto procedural.

## Chunk 3: Main orchestration + calibration loop

### Task 11: RED para la orquestación principal de generación

**Files:**
- Create: `src/main.generateMap.test.ts`
- Create: `src/ts/ui/map_generation_request_guard.test.ts`
- Modify: `src/nostr-overlay/App.map-generation.test.tsx`

- [ ] **Step 36: Escribir tests RED de `main.generateMap` para la publicación final**

Casos:
- una calibración con varios intentos solo dispara una vez el listener registrado vía `subscribeMapGenerated()`
- el listener registrado vía `subscribeMapGenerated()` observa solo el resultado final elegido
- si llega una solicitud más nueva durante una generación en curso, la solicitud vieja no publica resultado final
- `generateMap()` sin opciones mantiene el tamaño base independiente del `zoom`
- `generateMap({ targetBuildings: Number.NaN })` se normaliza al path por defecto sin romper la generación

- [ ] **Step 37: Ejecutar RED de la orquestación principal**

Run: `pnpm vitest run src/main.generateMap.test.ts src/ts/ui/map_generation_request_guard.test.ts`
Expected: FAIL porque `main.ts` aún no aísla ni protege la publicación final por solicitud.

- [ ] **Step 38: Ampliar tests RED del overlay para cubrir crecimiento y reducción entre regeneraciones**

Casos:
- un fixture con más `follows` pasa una `targetBuildings` mayor que otro con menos `follows`
- al regenerar manualmente después de cambiar el estado de `follows`, el bridge recibe el objetivo actualizado

- [ ] **Step 39: Ejecutar RED ampliado de integración**

Run: `pnpm vitest run src/nostr-overlay/App.map-generation.test.tsx`
Expected: FAIL por la cobertura nueva añadida del overlay.

### Task 12: Implementar la calibración en `Main.generateMap(options?)`

**Files:**
- Modify: `src/main.ts`
- Create: `src/ts/ui/map_generation_request_guard.ts`

- [ ] **Step 40: Cambiar `generateMap()` para aceptar `MapGenerationOptions`**

Objetivo:

```ts
async generateMap(options?: MapGenerationOptions): Promise<void>
```

- [ ] **Step 41: Resolver el `viewCenter` y los bounds iniciales desde el helper**

Objetivo:
- usar el centro visual actual del `DomainController`
- construir un `GenerationBounds` base independiente del `zoom`

- [ ] **Step 42: Recalcular el tensor field para cada intento**

Objetivo:
- llamar explícitamente a `tensorField.setRecommended(bounds)` en todos los intentos, tanto en el path por defecto como en el path con `targetBuildings`
- no confiar en un tensor field previo calculado con bounds ligados al viewport

- [ ] **Step 43: Ejecutar el bucle corto de calibración**

Contrato:
- reutilizar el helper ya testado en `src/ts/ui/map_generation_context.ts`; no reimplementar el algoritmo inline en `main.ts`
- máximo 4 intentos
- tras cada intento, medir `mainGui.getBuildingCentroidsWorld().length`
- si el recuento cae dentro de banda, aceptar y salir
- si no, calcular `nextBounds` con el helper y repetir

- [ ] **Step 44: Serializar solicitudes y publicar solo el intento final elegido**

Objetivo:
- crear `src/ts/ui/map_generation_request_guard.ts` con un guard pequeño de request id monotónico
- usar ese guard desde `main.ts`
- impedir ejecuciones en paralelo de dos solicitudes completas de generación
- conservar como pendiente solo la solicitud más reciente si llegan varias mientras otra está en curso
- impedir que solicitudes obsoletas limpien loading state, publiquen mapa visible o disparen notificaciones
- aplicar/redibujar solo el intento final aceptado o el mejor intento de la solicitud vigente

- [ ] **Step 45: Conservar el mejor intento si ninguno entra en banda**

Objetivo:
- comparar intentos por cercanía a `targetBuildings`
- preferir, en empate, el intento no deficitario
- hacer visible solo el intento final elegido; no publicar resultados parciales intermedios

- [ ] **Step 46: Mantener el comportamiento por defecto cuando no haya objetivo**

Objetivo:
- `generateMap()` sin opciones sigue funcionando
- el mapa por defecto también queda independiente del `zoom`
- una llamada sin opciones después de una regeneración con `targetBuildings` vuelve al tamaño base; no reutiliza el último target

- [ ] **Step 47: Ejecutar GREEN de la orquestación principal**

Run: `pnpm vitest run src/main.generateMap.test.ts src/ts/ui/map_generation_request_guard.test.ts`
Expected: PASS.

- [ ] **Step 48: Ejecutar GREEN de integración del overlay**

Run: `pnpm vitest run src/nostr-overlay/App.map-generation.test.tsx src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/domain/map-generation-target.test.ts`
Expected: PASS en el flujo completo de objetivo por `follows` y regeneración manual.

### Task 13: Verificación final del cambio

**Files:**
- Modify: `src/main.ts`
- Create: `src/main.generateMap.test.ts`
- Create: `src/ts/ui/map_generation_request_guard.ts`
- Create: `src/ts/ui/map_generation_request_guard.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Create: `src/ts/ui/tensor_field_gui.generation.test.ts`
- Modify: `src/ts/ui/tensor_field_gui.ts`
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/ts/ui/road_gui.ts`
- Modify: `src/ts/ui/water_gui.ts`
- Create: `src/map-generation-options.ts`
- Create: `src/nostr-overlay/domain/map-generation-target.ts`
- Create: `src/ts/ui/map_generation_context.ts`

- [ ] **Step 49: Ejecutar la suite focalizada del cambio**

Run: `pnpm vitest run src/main.generateMap.test.ts src/ts/ui/map_generation_request_guard.test.ts src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/domain/map-generation-target.test.ts src/nostr-overlay/App.map-generation.test.tsx src/ts/ui/map_generation_context.test.ts src/ts/ui/main_gui.generation_context.test.ts src/ts/ui/tensor_field_gui.generation.test.ts src/ts/ui/main_gui.traffic_zoom.test.ts`
Expected: PASS.

- [ ] **Step 50: Ejecutar una comprobación más amplia de regresión del overlay y UI del mapa**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx src/ts/ui/street_labels.test.ts src/ts/ui/style-occupancy.test.ts`
Expected: PASS.

- [ ] **Step 51: Commit**

```bash
git add src/map-generation-options.ts src/nostr-overlay/map-bridge.ts src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/domain/map-generation-target.ts src/nostr-overlay/domain/map-generation-target.test.ts src/nostr-overlay/hooks/useNostrOverlay.ts src/nostr-overlay/App.map-generation.test.tsx src/main.ts src/main.generateMap.test.ts src/ts/ui/map_generation_context.ts src/ts/ui/map_generation_context.test.ts src/ts/ui/map_generation_request_guard.ts src/ts/ui/map_generation_request_guard.test.ts src/ts/ui/main_gui.generation_context.test.ts src/ts/ui/tensor_field_gui.generation.test.ts src/ts/ui/main_gui.traffic_zoom.test.ts src/ts/ui/tensor_field_gui.ts src/ts/ui/main_gui.ts src/ts/ui/road_gui.ts src/ts/ui/water_gui.ts
git commit -m "feat(map): size city from follows independently of zoom"
```
