# Diseño: detalle de nota con anidación visual tipo Reddit

Fecha: 2026-04-21
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Mejorar el detalle de una nota para que las respuestas se lean como un hilo anidado por niveles, en lugar de verse como una lista plana alineada a la izquierda.

Requisitos acordados:

- El detalle de hilo debe parecerse al patrón visual de Reddit.
- Las respuestas directas a la nota raíz deben mostrar sangría visual y una línea vertical en el lateral izquierdo.
- Las respuestas a respuestas deben repetir ese patrón por nivel.
- La profundidad visual máxima será 4.
- A partir del nivel 4, la jerarquía real se mantiene pero la sangría visual deja de crecer.
- El detalle de hilo no debe heredar el `max-width: 600px` del feed.
- El feed principal de Agora no cambia.

## 2) Decisión principal

Se implementará un layout específico para el detalle de hilo que separe el rail visual de anidación del contenido de la tarjeta.

Se descarta un enfoque solo de CSS sobre el markup actual porque limita el control sobre las líneas verticales y produce una jerarquía visual menos parecida a Reddit. El cambio elegido introduce un wrapper de hilo más explícito alrededor de cada reply, manteniendo intacta la semántica del árbol de respuestas.

## 3) Alcance

El cambio aplica únicamente al render del detalle de hilo dentro de `FollowingFeedContent` cuando `activeThread` está presente.

En alcance:

- render recursivo de replies del hilo
- ancho del contenedor de detalle
- indentación visual por nivel
- rail vertical por nivel
- ajuste responsive básico para móvil
- tests de render y profundidad visual

Fuera de alcance:

- feed principal de Agora
- lógica de construcción de árbol (`buildThreadReplyTree`)
- ordenación de replies
- cambios en `NoteCard` salvo una necesidad puntual de compatibilidad de layout
- conectores complejos tipo árbol ASCII o líneas horizontales decorativas

## 4) Arquitectura propuesta

### 4.1 Estructura de render del hilo

Cuando `activeThread.root` exista, la raíz del hilo seguirá renderizándose como una `NoteCard` sin rail de anidación, pero pasará a vivir dentro de un wrapper explícito del hilo para que el contrato del DOM sea homogéneo y testeable.

Cada reply renderizará un wrapper visual dedicado con esta estructura conceptual:

```tsx
<div className="nostr-following-feed-thread-node" data-depth={depth} data-visual-depth={visualDepth}>
  <div className="nostr-following-feed-thread-row">
    <div className="nostr-following-feed-thread-indent" aria-hidden="true">
      {Array.from({ length: visualDepth }).map((_, index) => (
        <span
          key={index}
          className="nostr-following-feed-thread-rail"
          data-rail-index={index + 1}
        />
      ))}
    </div>
    <div className="nostr-following-feed-thread-body">
      <NoteCard ... />
    </div>
  </div>

  {childReplies.length > 0 ? (
    <div className="nostr-following-feed-thread-children">
      ...children...
    </div>
  ) : null}
</div>
```

Objetivo de cada unidad:

- `thread-node`: unidad recursiva del árbol, conserva `data-depth`
- `thread-row`: alinea rail y contenido en horizontal
- `thread-indent`: pinta la columna o columnas de anidación de ese reply
- `thread-rail`: unidad mínima visible del rail, una por nivel visual
- `thread-body`: aloja la `NoteCard` sin alterar su API
- `thread-children`: cuelga los hijos debajo del nodo actual

Cuando `activeThread.root` exista, la raíz del hilo usa el mismo wrapper base con este contrato fijo:

- `data-depth="0"`
- `data-visual-depth="0"`
- `thread-indent` presente pero vacío

Eso evita ambiguedades en tests y mantiene la raíz visualmente limpia.

Estados sin raíz disponible:

- si `activeThread.root` es `null` porque el hilo está cargando o todavía no se resolvió, se mantiene el comportamiento actual de loading/empty state
- no se renderiza un wrapper raíz placeholder ni rails decorativos para ancestros no cargados
- el contrato del wrapper raíz solo aplica cuando `activeThread.root` existe realmente

### 4.2 Profundidad visual

Se definirá una constante de presentación para limitar la profundidad visual:

```ts
const MAX_THREAD_VISUAL_DEPTH = 4;
```

Ubicación prevista:

- la constante vivirá en `FollowingFeedContent.tsx` mientras su uso siga siendo exclusivo del detalle de hilo
- no se moverá a un módulo compartido salvo que aparezca una segunda pantalla con la misma necesidad

Helper local previsto:

- `visualDepth` se calculará mediante un helper local y puro en `FollowingFeedContent.tsx`
- contrato sugerido: `getVisualThreadDepth(depth: number): number`

Regla:

- `visualDepth = Math.min(depth, MAX_THREAD_VISUAL_DEPTH)`

`depth` sigue representando la profundidad real del árbol. `visualDepth` solo controla cuántas columnas de rail y cuánta sangría se dibujan.

Esto permite que replies en profundidad 5+ sigan apareciendo bajo su padre correcto, pero sin estrechar progresivamente el layout más allá del límite acordado.

## 5) Contrato de render

### 5.1 Semántica de datos

No cambia la construcción del árbol.

- `buildThreadReplyTree(activeThread.replies)` sigue agrupando por `targetEventId`
- `visibleThreadReplies` sigue tomando los hijos directos de la raíz
- `renderThreadReplyNode(reply, depth)` sigue siendo recursiva

Regla explícita:

- Si varias respuestas apuntan directamente a la raíz, se renderizan como hermanas de nivel 1.
- Solo se anidan bajo otra respuesta cuando `targetEventId` apunta a esa respuesta.

No se introducirá ninguna heurística para “forzar” niveles visuales que no existan en los datos.

### 5.2 Diferencia entre profundidad real y visual

Cada nodo, incluida la raíz, conservará `data-depth={depth}` para tests y depuración.

Además, el wrapper visual recibirá `data-visual-depth={visualDepth}` para permitir reglas CSS y assertions claras sobre el cap de 4 niveles.

Contrato final por nodo de hilo:

- `data-depth`: profundidad real
- `data-visual-depth`: profundidad visual limitada a 4

Contrato observable del rail:

- `thread-indent` contiene exactamente `visualDepth` elementos `.nostr-following-feed-thread-rail`
- la raíz contiene 0 rails
- un reply con `data-visual-depth="3"` contiene exactamente 3 rails

## 6) Layout y estilos

### 6.1 Ancho del detalle de hilo

El `max-width: 600px` se mantendrá para el feed general, pero no para el detalle de hilo.

Decisión concreta:

- `.nostr-following-feed-list` conserva `max-width: 600px`
- el detalle de hilo recibirá una clase explícita `nostr-following-feed-thread-list-detail`
- `.nostr-following-feed-thread-list.nostr-following-feed-thread-list-detail` deja de usar ese límite y expande a `max-width: none; width: 100%`

Resultado esperado:

- el detalle aprovecha el ancho disponible del panel
- hay más espacio horizontal para anidar varios niveles sin estrechar en exceso las tarjetas
- todos los selectores nuevos de layout de hilo quedarán scopeados al detalle (`thread-list-detail`) para que el feed principal no herede reglas por accidente
- `nostr-following-feed-thread-list-detail` se aplicará en todos los estados del detalle de hilo: loading, empty, error y contenido cargado

### 6.2 Patrón visual tipo Reddit

El rail de anidación no se implementa como simple `padding-left` del bloque entero. Se implementa como una zona izquierda separada del contenido.

Características del rail:

- ancho fijo por columna de nivel
- línea vertical visible y continua
- color sutil alineado con el sistema actual de bordes
- separado de la tarjeta por una pequeña distancia constante

Características del contenido:

- la `NoteCard` usa todo el espacio horizontal restante
- no cambia su jerarquía interna, acciones ni callbacks
- el encogimiento de la tarjeta viene dado por la existencia del rail, no por márgenes arbitrarios sobre toda la card

### 6.3 Estrategia CSS

Se utilizará CSS basado en atributos para minimizar lógica imperativa en React.

Reglas previstas:

- `thread-row` usará `display: grid` con dos columnas: rail y body
- `thread-indent` renderiza una secuencia de columnas visuales según `data-visual-depth`
- cada columna de rail tiene un ancho fijo
- `thread-body` usa `min-width: 0` para evitar overflow
- `thread-children` conserva la recursión vertical del árbol

Decisión cerrada:

- se renderizarán `visualDepth` spans explícitos dentro de `thread-indent`
- no se usará una solución implícita basada solo en `background`, `box-shadow` o pseudo-elementos para representar niveles

Motivo:

- los spans hacen el contrato visual fácilmente testeable
- permiten contar niveles visibles sin depender de estilos computados
- reducen ambiguedad al planificar e implementar

## 7) Responsive

En móvil se reducirá el consumo horizontal del rail.

Reglas:

- breakpoint: `max-width: 640px`
- desktop/tablet > 640px:
  - cada `.nostr-following-feed-thread-rail` usa ancho visual de 14px
  - separación entre rail y contenido de 10px
- móvil <= 640px:
  - cada `.nostr-following-feed-thread-rail` usa ancho visual de 10px
  - separación entre rail y contenido de 6px
- el cap de 4 niveles se mantiene

Objetivo:

- preservar la lectura de jerarquía sin que las tarjetas queden demasiado estrechas en pantallas pequeñas

## 8) Testing

Se añadirán tests en `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`.

Cobertura mínima obligatoria:

1. Render de raíz y replies
- cuando `activeThread.root` existe, la raíz sigue renderizando `data-depth="0"`
- cuando `activeThread.root` existe, la raíz expone `data-visual-depth="0"`
- cuando `activeThread.root` existe, la raíz renderiza `.nostr-following-feed-thread-indent` con `0` elementos `.nostr-following-feed-thread-rail`
- si `activeThread.root` existe pero no hay replies, el root wrapper sigue existiendo con `data-depth="0"` y no se renderizan nodos hijo
- si `activeThread.root` es `null`, se mantiene el estado actual de loading/empty y no se exige wrapper raíz placeholder
- un hijo directo de la raíz renderiza wrapper de thread con `data-depth="1"`
- ese hijo directo renderiza `1` elemento `.nostr-following-feed-thread-rail`

2. Jerarquía real
- una respuesta hija de otra respuesta aparece dentro de la rama correspondiente
- replies hermanas de la raíz no aparecen falsamente anidadas entre sí

3. Cap visual
- un reply con `depth > 4` conserva `data-depth` real
- ese mismo nodo expone `data-visual-depth="4"`
- ese mismo nodo renderiza exactamente `4` elementos `.nostr-following-feed-thread-rail`

4. Layout contract
- el detalle de hilo usa la clase `nostr-following-feed-thread-list-detail`
- el feed principal no usa esa clase
- el feed principal conserva su layout actual

5. Regresión funcional
- siguen existiendo los botones y handlers de reply/reaction/repost/zap en replies del hilo

## 9) Riesgos y mitigaciones

### Riesgo 1: romper spacing o anchura de la `NoteCard`

Mitigación:

- mantener `NoteCard` como caja negra de contenido
- aislar el cambio al wrapper del hilo
- usar `min-width: 0` en el body y validar visualmente ramas profundas

### Riesgo 2: mobile demasiado estrecho

Mitigación:

- reducir ancho de rail en breakpoint pequeño
- conservar cap visual de 4 niveles

### Riesgo 3: confundir profundidad real con cap visual

Mitigación:

- mantener `data-depth` real
- introducir `data-visual-depth` separado
- tests explícitos para ambos valores

## 10) Plan de implementación esperado

La implementación se podrá dividir en estas unidades:

1. Ajustar el markup recursivo de replies en `FollowingFeedContent.tsx`
2. Añadir helpers o constantes mínimas para calcular `visualDepth`
3. Actualizar `styles.css` para rail, ancho completo del detalle y responsive
4. Añadir/ajustar tests del detalle de hilo
5. Verificar que el feed principal no cambia

## 11) Validación manual esperada

Escenarios manuales a comprobar durante implementación:

- detalle con varias respuestas directas a la raíz
- detalle con replies anidados 2, 3 y 4 niveles
- detalle con profundidad mayor de 4
- desktop con ancho amplio
- móvil o viewport estrecho
- respuestas con contenido largo y con acciones visibles

## 12) Nota de referencia visual

La referencia visual pedida por producto es Reddit. Durante esta fase de diseño se intentó revisar la URL facilitada, pero la inspección automatizada quedó bloqueada por la pantalla anti-bot de Reddit.

Por tanto, el spec toma como referencia operativa:

- la captura proporcionada por el usuario
- el patrón visual público y conocido de hilos de Reddit: rail izquierdo por nivel, desplazamiento acumulado y contenido ocupando el ancho restante
