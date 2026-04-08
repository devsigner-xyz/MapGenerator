# Owner Island Follow Landmark Design

## Context

El producto ya permite poblar edificios con cuentas Nostr y abrir un modal de perfil al hacer click en edificios ocupados. La nueva necesidad es agregar una isla fija en todos los mapas con un unico edificio habitado siempre por la misma identidad, para que cualquier visitante pueda encontrar y seguir esa cuenta.

## Goals

- Agregar una isla mediana fija dentro del mar en todos los mapas generados.
- Garantizar que la isla siempre tenga una zona verde visible.
- Agregar exactamente un edificio en esa isla.
- Mantener ese edificio siempre ocupado por la identidad fija del propietario.
- Mostrar un modal especial (distinto al modal de edificios normales) al hacer click en ese edificio.

## Non-Goals

- No cambiar la logica general de asignacion de follows a edificios normales.
- No convertir todos los edificios en modales personalizados.
- No depender de relays para renderizar la identidad de la isla (datos base fijos).
- No redisenar el motor completo de agua o streamlines.

## Fixed Owner Identity

- username: `strhodlery`
- npub: `npub1dd3k7ku95jhpyh9y7pgx9qrh2ykvtfl5lnncqzzt2gyhgw0a04ysm4paad`
- avatar: valor fijo configurable en codigo (con fallback visual si falta URL)

El `pubkey` hex se deriva desde `npub` via utilidades NIP-19 ya existentes para usarlo en ocupacion interna del mapa.

## High-Level Architecture

1. **Motor de agua** crea `ownerIslandPolygon` dentro de `seaPolygon`.
2. **Tensor field** reconoce que puntos dentro de la isla son tierra, aunque esten dentro del mar.
3. **Pipeline de edificios** inyecta un lote unico para la isla y expone su indice.
4. **Ocupacion** reserva ese indice para la identidad fija del propietario.
5. **Overlay Nostr** enruta el click de ese indice a un modal especial.
6. **UI** mantiene modales actuales para edificios normales sin regresiones.

## Detailed Design

### 1) Owner island geometry in water generation

Se agrega al flujo de `WaterGenerator` una fase de generacion de isla despues de construir el mar.

- Nueva propiedad: `ownerIslandPolygon: Vector[]`.
- El algoritmo busca una posicion valida dentro de `seaPolygon` con margen a costa/bordes.
- La forma de isla es un poligono simple (por ejemplo 8-12 vertices) de tamano mediano.
- Si no encuentra posicion valida en primer intento, usa reintentos deterministicos.
- Si aun falla, deja `ownerIslandPolygon` vacio y el sistema continua sin bloquear el mapa.

Resultado esperado: en condiciones normales, la isla aparece siempre; fallback evita ruptura en mapas extremos.

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

- Nueva salida: `ownerIslandBuildingIndex?: number`.
- El lote se deriva de `ownerIslandPolygon` (por ejemplo, un rectangulo/huella reducida centrada).
- Se anexa al arreglo final de lotes para que participe en render, hit-test y centroides.
- Solo se crea un lote especial por mapa.

### 5) Occupancy reservation

Se reserva el edificio de isla para el propietario fijo.

- El mapa expone `ownerIslandBuildingIndex` por API.
- Al aplicar ocupacion en overlay:
  - Se mantiene logica actual para follows.
  - Se fuerza `occupancy[ownerIslandBuildingIndex] = ownerPubkeyHexFijo`.
- Nunca se reasigna ese indice a otra cuenta.

### 6) Specialized modal routing

El evento de click sobre edificio ocupado se extiende con tipo de origen.

- Evento nuevo: `kind: 'owner_island' | 'regular'`.
- Si `kind === 'owner_island'`, overlay abre `OwnerIslandModal`.
- Si `kind === 'regular'`, mantiene `OccupantProfileModal` existente.

`OwnerIslandModal` muestra:

- avatar fijo
- username fijo
- npub fijo

## API and Contract Changes

### Main map API

- Agregar getter opcional: `getOwnerIslandBuildingIndex(): number | undefined`.
- Extender payload de `subscribeOccupiedBuildingClick` con `kind`.

### Map bridge

- Propagar `getOwnerIslandBuildingIndex`.
- Propagar el nuevo campo `kind` del click.

### Overlay state

- Nuevo estado UI para modal especial de isla.
- Mantener estados de modal normal sin cambios.

## Error Handling Strategy

- Si falla generacion de isla: no romper mapa, loggear warning y continuar.
- Si no existe indice de edificio-isla: no abrir modal especial.
- Si falta avatar fijo: mostrar fallback visual con iniciales.
- Si falla decodificacion de `npub` fija (no esperado): fallback a string npub para UI y no bloquear ocupacion normal.

## Testing Strategy

### Unit tests

- `water_generator`: isla creada dentro del mar y con area mediana objetivo.
- `tensor_field`: punto en isla es tierra; punto en mar fuera de isla no lo es.
- `buildings/main_gui`: existe un unico `ownerIslandBuildingIndex` valido.
- `map-bridge`: delega getter de edificio-isla y payload click con `kind`.
- `useNostrOverlay/App`: click owner island abre modal especial, click regular conserva modal actual.

### Manual QA

1. Generar varios mapas y verificar isla en todos.
2. Verificar color verde visible en isla.
3. Verificar un unico edificio en isla.
4. Verificar ocupacion fija de ese edificio para identidad propietaria.
5. Verificar modal especial al click en isla.
6. Verificar no-regresion en modales normales y enfoque de edificios normales.

## Risks and Mitigations

- **Riesgo:** la isla cae demasiado cerca de costa y se ve poco.
  - **Mitigacion:** margen minimo a costa y fallback de reubicacion.
- **Riesgo:** colision de indice reservado con asignacion social.
  - **Mitigacion:** inyeccion y reserva del indice antes de aplicar ocupacion final.
- **Riesgo:** complejidad extra en evento de click.
  - **Mitigacion:** compatibilidad hacia atras con valor por defecto `regular`.

## Acceptance Criteria

- En cada mapa generado, existe una isla mediana en la porcion de agua.
- La isla muestra verde visible de forma consistente.
- La isla contiene un solo edificio utilizable para click.
- Ese edificio siempre representa a `strhodlery` con el `npub` fijo.
- Al click, se abre modal especial de isla (avatar, username, npub).
- Los edificios no-isla mantienen su comportamiento y modal actual.
