# Diseño: generación de ciudad por seguidos e independiente del zoom

Fecha: 2026-04-21
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Hacer que la ciudad se regenere con un tamaño acorde al número de cuentas que el usuario sigue (`follows`), de forma que:

- si el usuario sigue a más personas y vuelve a entrar o recarga, la ciudad tienda a crecer
- si el usuario sigue a menos personas y vuelve a entrar o recarga, la ciudad tienda a reducirse
- el tamaño de la ciudad deje de depender del `zoom`
- el número final de edificios no tenga que coincidir exactamente con `follows.length`, pero sí debe ser suficientemente mayor para alojar a esa red con cierto margen

Requisitos acordados:

- la métrica que gobierna el tamaño es `seguidos`, no `seguidores`
- la ciudad puede crecer y reducirse entre sesiones
- el ajuste aplica al volver a conectar, al recargar y al regenerar manualmente el mapa
- no se requiere regeneración automática inmediata al pulsar seguir/dejar de seguir dentro de la misma sesión
- el `zoom` debe quedar como control de cámara/render, no como parámetro procedural

## 2) Decisiones principales

### 2.1 La señal de tamaño será `follows`

La fuente de verdad será `follows.length` resuelta en el overlay, reutilizando el flujo actual de carga de grafo social en `useNostrOverlay`.

No se usará `followers.length` ni una mezcla de ambas métricas.

### 2.2 El mapa se dimensionará por una capacidad objetivo, no por coincidencia exacta

El generador procedural seguirá siendo libre de producir variación visual y topológica, pero la generación pasará a recibir una `targetBuildings` calculada desde la red seguida.

La condición funcional es:

- el mapa resultante debe tender a tener más edificios que residentes asignables esperados
- debe existir margen para edificios vacíos y edificios especiales

### 2.3 La generación autenticada usará `regenerateMap`, no `ensureGenerated`

Hoy el arranque de la app puede generar un mapa por defecto antes de que el overlay cargue `follows`, y luego el overlay usa `ensureGenerated()`. Eso permite conservar una ciudad creada con un tamaño incorrecto para el usuario autenticado.

Se cambia ese contrato de uso:

- al cargar la red social del usuario autenticado, el overlay llamará siempre a `regenerateMap({ targetBuildings })`
- `ensureGenerated()` conserva su semántica actual y no aceptará `MapGenerationOptions` en este cambio; queda para flujos genéricos donde solo importa que exista un mapa, no que esté calibrado a la red seguida

Esta decisión también cumple mejor el requisito de “cada vez que me conecto o recargo la página se regenera el mapa”.

### 2.4 El desacoplamiento del zoom será estructural

No se corregirá el problema escalando a mano parámetros como `dsep`, `minArea`, `shrinkSpacing` o similares en función del `zoom`.

Se desacoplará la generación del estado de cámara introduciendo un contexto de generación explícito con límites (`origin`, `worldDimensions`) calculados sin depender de `domainController.worldDimensions`.

## 3) Alcance

En alcance:

- contrato compartido para pedir una regeneración con `targetBuildings`
- cálculo de `targetBuildings` a partir de `follows`
- regeneración autenticada del mapa usando esa capacidad objetivo
- contexto de generación independiente del `zoom`
- eliminación del hack actual que muta el `zoom` para inflar el área generada
- cálculo de `pathIterations` a partir del contexto procedural real, no del viewport actual
- calibración ligera por intentos para acercar el número de edificios al objetivo
- tests del contrato, del cálculo del objetivo, de la independencia del zoom y del wiring del overlay

Fuera de alcance:

- cambiar el algoritmo de asignación de pubkeys a edificios
- regenerar automáticamente la ciudad en caliente al pulsar seguir/dejar de seguir
- rediseñar el sistema de parks, special buildings o easter eggs más allá del buffer que necesitan
- hacer que el tamaño de ciudad sea idéntico en todos los tamaños de pantalla
- estabilizar visualmente la semilla procedural entre sesiones distintas

## 4) Problema actual

La generación depende hoy del `zoom` por esta cadena:

- `DomainController.worldDimensions` devuelve `screenDimensions / zoom`
- `TensorFieldGUI.setRecommended()` usa esas `worldDimensions` para colocar y escalar los campos
- `RoadGUI` y `WaterGUI` instancian sus generadores con `origin` y `worldDimensions` tomados del `DomainController`
- `RoadGUI.generateRoads()` y `WaterGUI.generateRoads()` además mutan temporalmente el `zoom` para inflar la zona de integración (`DRAW_INFLATE_AMOUNT`)
- los edificios se derivan de la red resultante, por lo que heredan ese cambio de escala

Consecuencia:

- `zoom` bajo: mundo procedural grande, más calles, más bloques, más edificios
- `zoom` alto: mundo procedural pequeño, menos calles, menos bloques, menos edificios

Además, `RoadGUI.setPathIterations()` escala el número de iteraciones con `window.innerWidth` / `window.innerHeight`, no con el tamaño real del mundo procedural que se intenta cubrir. Eso deja de ser válido si la ciudad pasa a dimensionarse por `targetBuildings`.

## 5) Arquitectura propuesta

### 5.1 Contrato compartido de regeneración

Se añadirá un contrato explícito de generación, por ejemplo:

```ts
export interface MapGenerationOptions {
    targetBuildings?: number;
}
```

El contrato se usará en:

- `src/map-generation-options.ts`
- `MapMainApi.generateMap(options?)`
- `MapBridge.regenerateMap(options?)`

Reglas:

- `targetBuildings` ausente significa “usar tamaño base por defecto”, siempre independiente del `zoom`
- `targetBuildings` inválido o no finito se normaliza a `undefined`
- una llamada posterior a `generateMap()` sin opciones no reutiliza el último `targetBuildings`; vuelve siempre al tamaño base por defecto

### 5.2 Cálculo del objetivo a partir de `follows`

El overlay seguirá siendo la única capa con conocimiento de Nostr y convertirá la red seguida en una capacidad objetivo del mapa.

La fórmula propuesta es deliberadamente simple y estable:

```ts
followedResidentCount = dedupe(
  follows
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
).length
systemBuffer = 8
emptyHeadroom = max(6, ceil(followedResidentCount * 0.15))
targetBuildings = min(600, max(24, followedResidentCount + systemBuffer + emptyHeadroom))
```

Intención de cada término:

- `followedResidentCount`: mantiene que la métrica principal sea exactamente `follows`, como se acordó
- `systemBuffer`: absorbe edificios especiales, easter eggs, ocupantes destacados y pequeñas variaciones sin obligar al overlay a depender de detalles internos del mapa
- `emptyHeadroom`: asegura huecos vacíos y evita una ciudad completamente saturada
- `max(24, ...)`: mantiene una ciudad mínima razonable cuando el usuario sigue a poca gente o a nadie
- `min(600, ...)`: limita el coste procedural para redes seguidas muy grandes

La métrica principal sigue siendo `follows`; el resto del cálculo es margen técnico y visual.

### 5.3 Ownership de helpers y responsabilidades

La propiedad de las piezas nuevas queda fijada así:

- `src/map-generation-options.ts`
  - contrato compartido `MapGenerationOptions`
- `src/nostr-overlay/domain/map-generation-target.ts`
  - conversión de `follows` a `targetBuildings`
- `src/ts/ui/map_generation_context.ts`
  - `GenerationBounds`
  - `resolveInitialGenerationBounds(...)`
  - `inflateGenerationBounds(...)`
  - `buildAcceptanceBand(...)`
  - `retuneGenerationBounds(...)`
  - `runGenerationCalibration(...)`
  - tamaño base procedural
  - `GenerationAttemptSnapshot` o estructura equivalente para puntuar intentos
  - helper del bucle de calibración con interfaz pública explícita

### 5.4 Banda de aceptación

El algoritmo no perseguirá una coincidencia exacta de edificios.

Se define una banda de aceptación alrededor de `targetBuildings`:

- límite inferior: `targetBuildings`
- límite superior: `targetBuildings + max(6, ceil(targetBuildings * 0.2))`

Interpretación:

- por debajo del límite inferior, la ciudad se considera demasiado pequeña para esa red social
- por encima del límite superior, la ciudad sigue siendo válida pero se considera innecesariamente grande y puede reintentarse con un mundo menor

## 6) Contexto de generación independiente del zoom

### 6.1 Centro de cámara estable

La ciudad seguirá generándose alrededor del centro visual actual del usuario, pero ese centro no definirá la escala del mundo procedural.

Se tomará el centro como:

```ts
viewCenter = domainController.origin.add(domainController.worldDimensions.divideScalar(2))
```

Ese centro es válido porque el setter de `zoom` ya mantiene el midpoint estable; el problema actual no es el centro, sino usar `worldDimensions` derivadas del `zoom` como tamaño de generación.

### 6.2 Tamaño base independiente del zoom

Cuando no haya `targetBuildings`, el tamaño base del mundo procedural saldrá de un tamaño de referencia independiente del `zoom` derivado del viewport físico.

Cuando sí haya `targetBuildings`, el tamaño del mundo se escalará desde ese baseline con una relación de área aproximada:

```ts
baseWorldDimensions = domainController.screenDimensions.clone()
baseTargetBuildings = 64
scale = sqrt(targetBuildings / baseTargetBuildings)
worldDimensions = baseWorldDimensions * scale
```

Reglas:

- `baseWorldDimensions` es el baseline procedural por defecto del mapa
- `baseTargetBuildings = 64` es un ancla interna de sizing, no un requisito visible al usuario
- el aspect ratio del mapa puede seguir reflejando el viewport físico
- el `zoom` deja de influir en `worldDimensions`

Esto es una estimación inicial; la calibración por intentos corrige el resto.

### 6.3 Bounds explícitos para la generación

Se introducirá una estructura explícita en `src/ts/ui/map_generation_context.ts`, por ejemplo:

```ts
export interface GenerationBounds {
    origin: Vector;
    worldDimensions: Vector;
}
```

`Main.generateMap(options?)` resolverá estos bounds una vez por intento y se los pasará a:

- `tensorField.setRecommended(bounds)`
- `mainGui.generateEverything(bounds)`

`MainGUI`, `RoadGUI` y `WaterGUI` dejarán de consultar `DomainController` para decidir el tamaño del mundo procedural.

## 7) Ajustes en la pipeline procedural

### 7.1 Tensor field

`TensorFieldGUI.setRecommended()` dejará de usar `domainController.worldDimensions` para la generación procedural y aceptará `GenerationBounds`.

Esto evita que la forma inicial de la ciudad vuelva a depender del `zoom`.

Además, la ruta autenticada no debe depender del `firstGenerate` actual para conservar un tensor field calculado con bounds incorrectos. Cuando haya regeneración explícita con objetivo, el tensor field recomendado debe recalcularse para el intento actual.

### 7.2 Roads y water

`RoadGUI.generateRoads()` y `WaterGUI.generateRoads()` recibirán `GenerationBounds` explícitos.

Se elimina el patrón actual:

- dividir temporalmente `domainController.zoom` entre `DRAW_INFLATE_AMOUNT`
- leer `origin/worldDimensions`
- restaurar `zoom`

En su lugar se construirá un `inflatedGenerationBounds` explícito a partir del intento actual. El `zoom` deja de mutarse durante la generación.

### 7.3 Path iterations

`pathIterations` ya no debe derivarse de `window.innerWidth` ni de `window.innerHeight` como aproximación al tamaño del mundo.

Nuevo criterio:

- calcularlo por intento usando `GenerationBounds.worldDimensions`
- usar esta fórmula concreta:

```ts
pathIterations = (1.5 * Math.max(worldDimensions.x, worldDimensions.y)) / dstep
```

Esto aplica a roads y water porque ambos comparten la misma familia de generadores.

### 7.4 Buildings, parks y demás capas derivadas

`Buildings`, `Graph`, `PolygonFinder`, `WaterGenerator` y `StreamlineGenerator` ya trabajan sobre geometría en mundo explícita. No necesitan conocer `zoom` si los callers les suministran bounds correctos.

Por tanto, la corrección principal debe concentrarse en las capas orquestadoras, no en reescribir la lógica de `impl/` sin necesidad.

## 8) Calibración por intentos

El primer cálculo de `worldDimensions` no será suficientemente preciso para acertar siempre el número de edificios, porque coast, river, parks y la propia aleatoriedad cambian el número final de lotes.

Se añade una calibración corta en `Main.generateMap(options?)`:

1. Resolver bounds iniciales desde `targetBuildings`.
2. Recalcular tensor field con esos bounds.
3. Generar roads, water, parks y buildings.
4. Medir `actualBuildings` como `mainGui.getBuildingCentroidsWorld().length`, es decir, el número bruto de lotes/edificios normales generados antes de ocupación.
5. Si el valor cae fuera de banda, ajustar `worldDimensions` y repetir.

Heurística propuesta:

```ts
errorRatio = targetBuildings / max(1, actualBuildings)
nextScale = sqrt(errorRatio)
```

Razones:

- el área crece aproximadamente con el cuadrado de la escala
- usar raíz cuadrada evita sobrecorrecciones violentas

Límites:

- máximo 4 intentos por regeneración
- si ningún intento entra en banda, se conserva el mejor intento

Visibilidad y side effects:

- los intentos intermedios son internos al proceso de generación
- solo el intento final aceptado, o el mejor intento si ninguno entra en banda, se considera el resultado comprometido/publicado del mapa
- `notifyMapGenerated()` y cualquier efecto externo del overlay deben ejecutarse una sola vez, después de elegir el intento final
- no se publican resultados parciales de intentos intermedios como resultado final del mapa
- durante la calibración puede existir estado interno transitorio mientras la UI siga en modo carga; lo importante es que no se comprometa ni notifique un resultado viejo o intermedio como definitivo

Concurrencia entre generaciones:

- solo puede existir una solicitud de generación activa a la vez
- si llega una nueva `generateMap()` o `regenerateMap({ targetBuildings })` mientras otra sigue en curso, no se ejecuta en paralelo: queda registrada como siguiente solicitud pendiente
- cuando la solicitud activa termina, solo se lanza la solicitud pendiente más reciente
- las solicitudes obsoletas no pueden limpiar loading state, publicar resultado visible ni disparar notificaciones
- el gate de solicitud vigente y pendiente vive en `Main.generateMap()` mediante un identificador monotónico por petición

Definición de “mejor intento”:

- primero, el más cercano al objetivo
- en empate, se prefiere el intento que no quede por debajo de `targetBuildings`

## 9) Flujo funcional esperado

### 9.1 Usuario anónimo o sin objetivo explícito

- la app puede seguir generando un mapa inicial por defecto
- ese mapa ya no dependerá del `zoom`
- usará el tamaño base procedural

### 9.2 Usuario autenticado al cargar la app

- se cargan `follows`
- el overlay calcula `targetBuildings`
- se llama a `mapBridge.regenerateMap({ targetBuildings })`
- la ciudad se reemplaza por una versión ajustada a esa red seguida
- esta regeneración ocurre una vez tras la primera carga autenticada correcta de `follows` en esa sesión

### 9.3 Usuario pulsa regenerar mapa manualmente

- se reutiliza el `follows` actual del estado del overlay
- se recalcula `targetBuildings`
- se vuelve a generar una ciudad con ese objetivo
- este es el mecanismo explícito para reflejar cambios posteriores de `follows` sin esperar a una recarga completa

### 9.4 Usuario sigue o deja de seguir cuentas dentro de la sesión

- la ocupación y los contadores pueden actualizarse como hoy
- no se fuerza regeneración inmediata del terreno/carreteras/edificios
- el nuevo tamaño se reflejará al recargar, iniciar una nueva sesión autenticada o regenerar manualmente

Política exacta de regeneración por `follows`:

- regenerar una vez tras la primera carga autenticada correcta
- regenerar de nuevo solo ante recarga de página, nuevo login completo de sesión o acción manual de regenerar mapa
- no regenerar automáticamente en cada refresh de `follows` de background ni en cada cambio incremental de la lista seguida dentro de la misma sesión

## 10) Error handling y compatibilidad

- Si `follows` aún no está disponible, la generación puede seguir usando el tamaño base por defecto hasta que el overlay autenticado dispare `regenerateMap({ targetBuildings })`.
- Si `targetBuildings` es `0`, negativo, `NaN` o no finito, se normaliza a `undefined` y el mapa usa el tamaño base.
- Si la calibración no consigue entrar en banda tras el máximo de intentos, se conserva el mejor intento en lugar de dejar el mapa vacío o fallar la carga.
- Si el usuario no está autenticado, no se intentará inferir un tamaño por red social.
- Si la carga de `follows` falla de forma persistente, el mapa conserva el tamaño base por defecto; no se bloqueará la app esperando indefinidamente una calibración por red social.
- Si en el futuro cambian los featured occupants, el helper de cálculo seguirá siendo válido porque ya añade headroom y no depende del número exacto de slots especiales del mapa.
- No se añade cancelación explícita de una generación ya arrancada; sí se exige serialización de solicitudes y descarte de peticiones pendientes obsoletas, manteniendo solo la más reciente.

Compatibilidad explícita:

- el contrato de `MapBridge.listBuildings()` no cambia
- la asignación de pubkeys a edificios no cambia
- el sistema de parks, street labels y tráfico sigue consumiendo la geometría final generada

UX explícita aceptada:

- el mapa anónimo o por defecto puede aparecer brevemente antes de que el overlay autenticado regenere la ciudad ajustada a `follows`
- ese reemplazo posterior se considera aceptable en este cambio, siempre que el mapa final autenticado sea el calibrado

## 11) Testing

Cobertura mínima esperada:

- `src/nostr-overlay/domain/map-generation-target.test.ts`
  - ciudad mínima con `follows` vacíos
  - crecimiento del objetivo al aumentar `follows`
  - reducción del objetivo al disminuir `follows`
  - deduplicación de `follows`
- `src/nostr-overlay/map-bridge.test.ts`
  - `regenerateMap(options)` delega `targetBuildings`
- `src/nostr-overlay/App.map-generation.test.tsx` o coverage equivalente
  - la carga autenticada usa `regenerateMap({ targetBuildings })`
  - el objetivo deriva de `follows`
  - el botón de regenerar reutiliza el `follows` más reciente del estado
  - seguir/dejar de seguir no dispara regeneración automática del mapa
- `src/ts/ui/map_generation_context.test.ts`
  - cálculo de bounds base independiente del `zoom`
  - inflación explícita por `DRAW_INFLATE_AMOUNT`
  - cálculo de banda de aceptación
  - retune usando raíz cuadrada del error
  - helper del bucle de calibración: parada al entrar en banda, máximo 4 intentos y selección del mejor intento
- `src/ts/ui/main_gui.generation_context.test.ts`
  - `MainGUI.generateEverything(bounds)` propaga los mismos bounds a roads y water
  - la generación procedural no necesita mutar el `zoom`
  - `pathIterations` se recalcula a partir de `worldDimensions` del intento

## 12) Riesgos y mitigaciones

Riesgo principal: el número de edificios no escala linealmente con el tamaño del mundo por el efecto combinado de costa, río, parks y subdivisión de polígonos.

Mitigación:

- calibración por intentos con banda de aceptación en vez de objetivo exacto

Riesgo secundario: el primer mapa que ve el usuario puede ser el anónimo por defecto y luego reemplazarse por el mapa calibrado al cargar el overlay autenticado.

Mitigación:

- usar siempre `regenerateMap({ targetBuildings })` en la ruta autenticada, de forma explícita y consistente

Riesgo terciario: mover el cálculo de bounds y `pathIterations` puede romper tests o mocks existentes que asumían `generateRoads()` sin parámetros.

Mitigación:

- añadir tests dedicados al nuevo contrato y actualizar los mocks de `RoadGUI` / `WaterGUI` solo en los tests afectados

## 13) Resultado esperado

La app podrá seguir generando una ciudad procedural libre, pero su tamaño dejará de depender del `zoom`. Cuando el usuario cargue su red social, la ciudad se regenerará con una capacidad proporcional al número de cuentas que sigue, con suficiente margen para edificios vacíos y especiales. Si en la siguiente sesión sigue a más gente, la ciudad crecerá; si sigue a menos, la ciudad se reducirá.
