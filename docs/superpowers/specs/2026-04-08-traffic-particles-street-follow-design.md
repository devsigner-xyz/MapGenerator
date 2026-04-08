# Traffic Particles Street Follow Design

## Context

El mapa ya dibuja calles y edificios con un loop de render continuo via `requestAnimationFrame`. Se quiere agregar dinamismo visual con minicoches discretos (sin sprite de coche), representados como particulas con halo suave que circulen estrictamente por las calles.

El comportamiento pedido por producto es:

- Seguimiento estricto del trazo de calles.
- Movimiento continuo con giros en curvas y cruces.
- En cruces, salida totalmente aleatoria entre calles conectadas.
- Si una particula sale del limite del mapa, debe reiniciarse.
- Configuracion desde UI settings de:
  - cantidad de particulas (`0..50`),
  - velocidad global.

## Goals

- Agregar trafico visual discreto de particulas sobre las calles.
- Mantener seguimiento estricto de polilineas de calle con giros naturales.
- Permitir configurar cantidad de particulas (`0..50`) en tiempo real.
- Permitir configurar velocidad de particulas en tiempo real.
- Persistir ambos ajustes en `localStorage` junto al resto de UI settings.

## Non-Goals

- No introducir modelos/sprites de coches ni orientacion visual de vehiculo.
- No agregar librerias externas de animacion.
- No cambiar el algoritmo de generacion de calles.
- No alterar reglas de ocupacion Nostr ni modales de perfiles.

## Decision Summary

Se adopta la **opcion A**: construir una red vial basada en segmentos de calle y mover particulas arista por arista.

Razones:

- Garantiza adherencia estricta al trazado de calles.
- Resuelve cruces y curvas de forma robusta y barata.
- Encaja con el loop actual del mapa sin dependencias externas.

## High-Level Architecture

1. **Road network build**
   - Se construye una red de trafico a partir de calles generadas (`main`, `major`, `minor`, `coastlineRoads`).
   - Cada tramo consecutivo de polilinea se transforma en arista dirigida (en ambos sentidos).

2. **Traffic simulation state**
   - Se mantiene una coleccion de particulas con estado por arista (`edgeId`, distancia, direccion, velocidad individual).
   - El update corre en cada frame dentro del pipeline existente.

3. **Rendering layer**
   - Se proyectan posiciones de particulas a pantalla y se dibujan como punto + halo suave.
   - Orden visual pensado para ser discreto y legible.

4. **Settings bridge**
   - `MapSettingsModal` permite editar cantidad y velocidad.
   - `ui-settings` persiste y normaliza.
   - `App` propaga a `MapBridge` y este al motor principal.

## Detailed Design

### 1) Traffic domain module

Se agrega un modulo de dominio UI, por ejemplo `src/ts/ui/traffic_particles.ts`, responsable de:

- Construir la red de trafico desde polilineas de calles en mundo.
- Instanciar y administrar N particulas.
- Actualizar movimiento por `deltaTime`.
- Exponer posiciones de render en mundo.

Estructuras sugeridas:

```ts
type TrafficNode = { id: number; point: Vector; outEdgeIds: number[] };
type TrafficEdge = {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  from: Vector;
  to: Vector;
  length: number;
};
type TrafficParticle = {
  edgeId: number;
  distanceOnEdge: number;
  speedFactor: number;
};
```

Notas de red:

- Nodos se deduplican por tolerancia pequena para unir cruces numericamente cercanos.
- Aristas de longitud minima se descartan para evitar jitter.
- Cada nodo guarda metadato `degree` para distinguir vertices de curva (grado 2) vs cruces reales (grado >= 3).

RNG:

- El modulo recibe `random: () => number` inyectable (default `Math.random`) para evitar tests flakey.

### 2) Movement rules

Reglas normativas por frame:

1. `distanceOnEdge += baseSpeed * trafficParticlesSpeed * speedFactor * deltaSeconds`.
2. Si `distanceOnEdge >= edge.length`:
   - avanzar al nodo final,
   - si el nodo es un cruce real, elegir aleatoriamente una arista saliente,
   - si no es cruce (vertice de continuidad), continuar por la arista de continuidad geometrica,
   - en cruces reales, los candidatos incluyen todas las salidas conectadas (incluida la inversa inmediata si existe),
   - reiniciar distancia sobrante sobre nueva arista.
3. Si no hay salida valida, hacer respawn de la particula.
4. Si la posicion actual de la particula cae fuera del limite del mapa, hacer respawn.

Regla de cruce (decidida por producto):

- Seleccion completamente aleatoria entre salidas conectadas (sin sesgo a seguir recto).

Respawn:

- Elegir arista aleatoria valida de la red.
- Posicionar distancia inicial aleatoria dentro de esa arista.

Limite del mapa:

- Se define como bounds de mundo activos en runtime: `origin` + `worldDimensions` de `DomainController`.
- Se implementa helper unico `isWithinWorldBounds(point)` y ese helper es la unica regla para respawn por salida de limite.

### 3) Integration points

#### `MainGUI`

- Nuevos setters publicos:
  - `setTrafficParticlesCount(count: number): void`
  - `setTrafficParticlesSpeed(speed: number): void`
- En `update(deltaSeconds: number)`: actualizar simulacion de particulas usando `deltaSeconds`.
- En regeneraciones de mapa: reconstruir red y resembrar particulas.
- En `draw()`: pasar posiciones de particulas (en pantalla) a `Style`.

#### `Main`

- `Main.update()` calcula `deltaSeconds` con `performance.now()` y llama `mainGui.update(deltaSeconds)`.
- Se clampa `deltaSeconds` a `[0, 0.1]` para evitar saltos bruscos tras pestaña inactiva/tab restore.
- Se conserva el resto del pipeline de animacion actual sin cambios funcionales.

#### `Style`

- Nueva propiedad de render, por ejemplo `trafficParticles: { center: Vector; radiusPx: number; haloPx: number; alpha: number }[]`.
- `DefaultStyle.draw`:
  - dibuja halo suave (baja opacidad) y nucleo pequeno.
  - no usar color agresivo; mantener efecto discreto.
- `RoughStyle.draw`:
  - dibuja solo nucleo simple para no penalizar rendimiento ni romper estilo rough.

Orden de capas recomendado:

- agua/parques/calles -> particulas trafico -> labels/capas overlay.

### 4) Settings and persistence

#### `src/nostr/ui-settings.ts`

Agregar en estado y payload:

- `trafficParticlesCount: number` (default `12`, min `0`, max `50`, entero)
- `trafficParticlesSpeed: number` (default `1.0`, min `0.2`, max `3.0`)

Agregar normalizadores:

- count: clamp + round.
- speed: clamp + precision moderada (sin NaN/Infinity).

#### `MapSettingsModal` (vista UI)

Agregar controles:

- Slider `Cars in city` (`0..50`, `step=1`)
- Slider `Cars speed` (`0.2..3.0`, `step=0.1`)

Persistencia via `persistUiSettings` como ya se hace con zoom labels/calles.

#### Propagacion runtime

- `App.tsx` aplica settings de trafico al `mapBridge` en `useEffect`.
- `map-bridge.ts` extiende API y bridge con:
  - `setTrafficParticlesCount(count: number)`
  - `setTrafficParticlesSpeed(speed: number)`
- `main.ts` delega a `MainGUI`.

## API Contract Changes

### MapMainApi / MapBridge

Agregar opcionales backward-compatible en `MapMainApi`:

```ts
setTrafficParticlesCount?(count: number): void;
setTrafficParticlesSpeed?(speed: number): void;
```

Y agregar metodos concretos en `MapBridge`:

```ts
setTrafficParticlesCount(count: number): void;
setTrafficParticlesSpeed(speed: number): void;
```

## Error Handling Strategy

- Si no hay red de calles valida: no actualizar ni dibujar trafico (fail-soft).
- Si `count=0`: vaciar lista de particulas y omitir update/render.
- Si speed invalida (NaN/Infinity): usar valor normalizado por defaults.
- Si en un nodo no hay salidas: respawn inmediato.

## Performance Considerations

- Limite superior de 50 particulas reduce coste por frame.
- Update lineal O(n) por frame con n pequeno.
- No se introduce dependencia externa ni scheduler adicional.
- Caches de red se recomputan solo cuando cambia el mapa (no en cada frame).

## Testing Strategy

### Unit tests

- `ui-settings.test.ts`
  - defaults incluyen count/speed nuevos.
  - clamp correcto en save/load para count/speed.
- `MapSettingsModal.test.tsx`
  - sliders de `Cars in city` y `Cars speed` visibles.
  - cambios persisten en `localStorage`.
- `map-bridge.test.ts` y `App.test.tsx`
  - incluir nuevos metodos `setTrafficParticlesCount` y `setTrafficParticlesSpeed` en stubs/contratos.
  - verificar aplicacion en carga inicial y tras cambios de UI settings.
- Nuevo `traffic_particles.test.ts`
  - inyeccion de RNG semillado para reproducibilidad.
  - avance sobre arista.
  - continuidad determinista en vertices de curva no-cruce.
  - salto en cruce con seleccion aleatoria valida (solo en cruces reales).
  - inclusion de U-turn como opcion valida en cruces reales.
  - conservacion de distancia sobrante en cambio de arista dentro del mismo frame.
  - respawn por salida de limites.
  - desactivacion total con count 0.

### Manual QA

1. Generar mapa y verificar particulas moviendose por calles sin salirse del trazo.
2. Confirmar giros en cruces y curvas.
3. Ajustar `Cars in city` a 0 y 50, verificar impacto inmediato.
4. Ajustar `Cars speed` y verificar cambio de velocidad inmediato.
5. Regenerar mapa y verificar que las particulas se reubican sin errores.
6. Recargar pagina y verificar persistencia de ambos settings.

## Risks and Mitigations

- **Riesgo:** cruces no conectados por precision numerica.
  - **Mitigacion:** deduplicacion de nodos con tolerancia fija y pruebas unitarias.
- **Riesgo:** visual demasiado llamativo.
  - **Mitigacion:** halo y opacidad bajos + radio pequeno por defecto.
- **Riesgo:** saltos visuales al cambiar de arista.
  - **Mitigacion:** conservar distancia sobrante en transicion de edge.

## Acceptance Criteria

- Hay trafico visual discreto sobre calles con efecto punto+halo.
- Las particulas siguen estrictamente las calles y giran en curvas/cruces.
- En cruces, la salida se elige aleatoriamente entre calles conectadas.
- Si una particula sale del limite, se reinicia correctamente.
- Settings de UI permiten configurar cantidad (`0..50`) y velocidad.
- Los settings persisten en `localStorage` y se aplican al cargar.
- No se incorpora ninguna libreria de animacion externa.
