# Owner Island Follow Landmark Design

## Context

El producto ya permite poblar edificios con cuentas Nostr y abrir un modal de perfil al hacer click en edificios ocupados. La nueva necesidad es agregar una isla fija en todos los mapas con un unico edificio habitado siempre por la misma identidad de landmark, para que cualquier visitante pueda encontrar y seguir esa cuenta.

## Goals

- Agregar una isla mediana fija dentro del mar en todos los mapas generados.
- Garantizar que la isla siempre tenga una zona verde visible.
- Agregar exactamente un edificio en esa isla.
- Mantener ese edificio siempre ocupado por la identidad fija del landmark.
- Mostrar un modal especial (distinto al modal de edificios normales) al hacer click en ese edificio.

## Non-Goals

- No cambiar la logica general de asignacion de follows a edificios normales.
- No convertir todos los edificios en modales personalizados.
- No depender de relays para renderizar la identidad de la isla (datos base fijos).
- No redisenar el motor completo de agua o streamlines.

## Fixed Landmark Identity

- username: `strhodlery`
- npub: `npub1dd3k7ku95jhpyh9y7pgx9qrh2ykvtfl5lnncqzzt2gyhgw0a04ysm4paad`
- avatar: valor fijo configurable en codigo (con fallback visual si falta URL)

El `pubkey` hex se deriva desde `npub` via utilidades NIP-19 ya existentes para usarlo en ocupacion interna del mapa.

## High-Level Architecture

1. **Motor de agua** crea `ownerIslandPolygon` dentro de `seaPolygon`.
2. **Tensor field** reconoce que puntos dentro de la isla son tierra, aunque esten dentro del mar.
3. **Pipeline de edificios** inyecta un lote unico para la isla y expone su indice.
4. **Ocupacion** reserva ese indice para la identidad fija del landmark.
5. **Overlay Nostr** enruta el click de ese indice a un modal especial.
6. **UI** mantiene modales actuales para edificios normales sin regresiones.

## Determinism Contract

- La colocacion de isla no usa `Math.random`.
- El algoritmo de busqueda es determinista: orden de candidatos fijo y limite de intentos fijo.
- El lote de edificio-isla se calcula de forma determinista a partir de `ownerIslandPolygon`.
- Invariante: para la misma geometria de mar de entrada, el resultado (`ownerIslandPolygon` y `ownerIslandBuildingIndex`) es igual.

## Detailed Design

### 1) Owner island geometry in water generation

Se agrega al flujo de `WaterGenerator` una fase de generacion de isla despues de construir el mar.

- Nueva propiedad: `ownerIslandPolygon: Vector[]`.
- El algoritmo busca una posicion valida dentro de `seaPolygon` con margen a costa/bordes usando candidatos deterministicos.
- La forma de isla es un poligono simple (por ejemplo 8-12 vertices) de tamano mediano.
- Si no encuentra posicion valida en primer intento, usa reintentos deterministicos con lista fija de offsets.
- Si aun falla, aplica fallback obligatorio de isla valida predefinida en area maritima segura para mantener el contrato "en todos los mapas".

Resultado esperado: la isla existe en todos los mapas, incluso en escenarios geometricos extremos.

### 2) Land/water semantics in TensorField

Se extiende `TensorField` para incluir la nueva isla.

- Nueva propiedad: `ownerIsland: Vector[]`.
- Ajuste en `onLand(point)`:
  - Si el punto esta dentro de `ownerIsland`, retornar `true`.
  - Si no, mantener semantica actual (`!inSea && !inRiver`, segun flags).

Esto habilita que el resto de etapas (poligonos/lotes) trate la isla como superficie edificable.

### 3) Guaranteed green rendering for the island

Se dibuja la isla como capa propia en `MainGUI`/`Style` para asegurar verde visible.

- Nueva data de render: `ownerIslandPolygon` en coordenadas de pantalla.
- Color: verde fijo de landmark (independiente de variaciones del esquema general) para cumplir requerimiento funcional.
- Esta capa se dibuja antes de edificios y despues del agua, para legibilidad.

### 4) Single reserved island building

Se agrega un lote especial y unico para la isla en `Buildings`.

- Nueva salida: `ownerIslandBuildingIndex: number`.
- El lote se deriva de `ownerIslandPolygon` (por ejemplo, un rectangulo/huella reducida centrada).
- Se anexa al arreglo final de lotes para que participe en render, hit-test y centroides.
- Solo se crea un lote especial por mapa.

Fallback obligatorio para huella:

1. Intento base: huella derivada por shrink centrado en isla.
2. Si falla por geometria: huella minima rectangular centrada y clamped a la isla.
3. Si falla de nuevo: huella minima sintetica en centro de isla, fuera del pipeline de subdivide, para no romper el contrato de "unico edificio siempre presente".

### 5) Occupancy reservation

Se reserva el edificio de isla para la identidad fija del landmark.

- El mapa expone `ownerIslandBuildingIndex` por API.
- Algoritmo normativo de ocupacion:
  1. Excluir `ownerIslandBuildingIndex` del dominio asignable social.
  2. Ejecutar asignacion social normal para el resto de indices.
  3. Insertar `occupancy[ownerIslandBuildingIndex] = landmarkOwnerPubkeyHex`.
- Regla de metricas: el edificio landmark no cuenta para `assignedCount` social ni para `unassignedCount` de follows.
- Nunca se reasigna ese indice a otra cuenta.

### 6) Specialized modal routing

El evento de click sobre edificio ocupado se extiende con tipo de origen.

- Evento nuevo: `kind: 'owner_island' | 'regular'`.
- Si `kind === 'owner_island'`, overlay abre `OwnerIslandModal`.
- Si `kind === 'regular'`, mantiene `OccupantProfileModal` existente.
- Regla de decision: el modal especial se decide por `kind` (y respaldo por `ownerIslandBuildingIndex`), no por igualdad de pubkey.

`OwnerIslandModal` muestra:

- avatar fijo
- username fijo
- npub fijo

## API and Contract Changes

### Main map API

- Agregar getter opcional: `getOwnerIslandBuildingIndex(): number | undefined`.
- Extender payload de `subscribeOccupiedBuildingClick` de manera backward-compatible:

```ts
type OccupiedBuildingClickPayload = {
  buildingIndex: number;
  pubkey: string;
  kind?: 'regular' | 'owner_island';
};
```

- Durante migracion, si `kind` no existe, se asume `regular`.

### Map bridge

- Propagar `getOwnerIslandBuildingIndex`.
- Propagar el nuevo campo `kind` del click.

### Overlay state

- Nuevo estado UI para modal especial de isla (`landmarkOwner*`), separado de `ownerPubkey/ownerProfile` social actuales.
- Mantener estados de modal normal sin cambios.
- `useNostrOverlay` no debe inferir edificio-isla via hash; debe usar `getOwnerIslandBuildingIndex()` cuando exista.

## Error Handling Strategy

- Si falla generacion base de isla: activar fallback obligatorio de isla valida y loggear warning estructurado.
- Si falla huella base de edificio-isla: activar fallback obligatorio de huella minima.
- Si falta avatar fijo: mostrar fallback visual con iniciales.
- Si falla decodificacion de `npub` fija (no esperado): fallback a string npub para UI y no bloquear ocupacion normal.

## Testing Strategy

### Unit tests

- `water_generator`: isla creada dentro del mar y con area mediana objetivo.
- `tensor_field`: punto en isla es tierra; punto en mar fuera de isla no lo es.
- `buildings/main_gui`: existe un unico `ownerIslandBuildingIndex` valido.
- `map-bridge`: delega getter de edificio-isla y payload click con `kind`.
- `useNostrOverlay/App`: click owner island abre modal especial, click regular conserva modal actual.
- `assignment/occupancy`: `ownerIslandBuildingIndex` excluido de asignacion social y metricas sociales consistentes.
- `main.ts` integracion: payload click regular y `owner_island` llega completo al overlay.
- Failure modes: fallback de isla y fallback de huella mantienen contrato de isla+edificio.

### Manual QA

1. Generar varios mapas y verificar isla en todos.
2. Verificar color verde visible en isla.
3. Verificar un unico edificio en isla.
4. Verificar ocupacion fija de ese edificio para identidad propietaria.
5. Verificar modal especial al click en isla.
6. Verificar no-regresion en modales normales y enfoque de edificios normales.
7. Regenerar mapa multiples veces y confirmar que siempre hay isla+edificio.
8. Verificar que exportaciones (PNG/SVG/heightmap) incluyen la isla en orden visual correcto.

## Risks and Mitigations

- **Riesgo:** la isla cae demasiado cerca de costa y se ve poco.
  - **Mitigacion:** margen minimo a costa y fallback de reubicacion.
- **Riesgo:** colision de indice reservado con asignacion social.
  - **Mitigacion:** inyeccion y reserva del indice antes de aplicar ocupacion final.
- **Riesgo:** complejidad extra en evento de click.
  - **Mitigacion:** compatibilidad hacia atras con valor por defecto `regular`.

## Operational Safeguards

- Logging estructurado para fallbacks:
  - `OWNER_ISLAND_GEN_FALLBACK_USED`
  - `OWNER_ISLAND_BUILDING_FALLBACK_USED`
- Mantener conteo local de ocurrencias para detectar regresiones en QA.

## Rendering Contract

- La capa `ownerIslandPolygon` se dibuja en `DefaultStyle` y `RoughStyle`.
- La isla aparece en render normal y exportaciones (`PNG`, `SVG`, `Heightmap`).
- Orden de capas: agua -> owner island verde -> parques/roads -> edificios.

## Acceptance Criteria

- En cada mapa generado, existe una isla mediana en la porcion de agua.
- La isla muestra verde visible de forma consistente.
- La isla contiene un solo edificio utilizable para click.
- Ese edificio siempre representa a `strhodlery` con el `npub` fijo.
- Al click, se abre modal especial de isla (avatar, username, npub).
- Los edificios no-isla mantienen su comportamiento y modal actual.
