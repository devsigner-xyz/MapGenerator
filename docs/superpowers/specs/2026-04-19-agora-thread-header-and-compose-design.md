# Agora Thread Header And Compose Design

## Context

La vista de detalle de una nota dentro de `Agora` tiene dos inconsistencias visuales respecto al resto del overlay:

- el boton `Volver al Agora` aparece a la izquierda del header, compitiendo con el titulo de la pagina
- la carga inicial del hilo usa el texto `Cargando hilo...` como footer de lista en lugar de un estado vacio centrado con `Empty + Spinner`

Ademas, tanto el composer principal de `Agora` como el composer de respuesta del hilo solo muestran el `Textarea` y el CTA principal, pero ahora necesitan una fila inferior de acciones con un iconbutton de imagen a la izquierda y el boton de envio a la derecha, siguiendo el patron de shadcn de `Textarea` con acciones debajo.

## Scope

Dentro de alcance:

- `FollowingFeedContent.tsx`
- tests del feed o del hilo que cubran header, loading state y composers

Fuera de alcance:

- logica real de subida de imagenes
- cambios de comportamiento en publicacion o respuestas mas alla del layout
- refactors amplios del feed fuera de esta pantalla

## Goals

- Mover `Volver al Agora` al extremo derecho del header cuando hay un hilo abierto.
- Sustituir la carga inicial del hilo por un estado centrado con `Empty + Spinner`.
- Mantener un footer de carga solo para `load more` cuando ya haya contenido visible.
- Reorganizar los composers de `Agora` y de `Hilo` para que usen `Textarea` arriba y una fila inferior con iconbutton de imagen a la izquierda y CTA de envio a la derecha.

## Non-Goals

- No hacer funcional el adjunto de imagen.
- No cambiar el copy principal de `Publicar` o `Responder` salvo el necesario para estados cargando.
- No introducir un nuevo sistema compartido de composer si el ajuste local es suficiente.

## Decision

Se mantiene el cambio dentro de `FollowingFeedContent.tsx` con una implementacion minima y consistente con el patron actual del overlay:

- el header renderiza el titulo a la izquierda y las acciones a la derecha, incluyendo `Volver al Agora` cuando `activeThread` esta abierto
- la carga inicial del hilo se representa con un `Empty` centrado dentro del area principal del hilo, usando `Spinner`, titulo y descripcion
- la carga incremental del hilo conserva `ListLoadingFooter` solo cuando ya existe contenido y se estan recuperando mas respuestas
- ambos composers comparten la misma disposicion visual: `Textarea` arriba y fila de acciones debajo con un `Button` icon-only de imagen alineado a la izquierda y el CTA principal alineado a la derecha

## State Contract

- La implementacion actual del hilo ya expone `activeThread.isLoading`, `activeThread.isLoadingMore`, `activeThread.root` y `activeThread.replies`; este diseno reutiliza ese contrato sin anadir nuevos flags.
- Se considera carga inicial bloqueante del hilo cuando `activeThread.isLoading === true`, `activeThread.root === null` y `activeThread.replies.length === 0`.
- Si `activeThread.root` ya existe o `activeThread.replies.length > 0`, el hilo no debe volver al estado centrado; en ese caso se mantiene el contenido visible y el feedback adicional se resuelve con `ListLoadingFooter`.
- Si existen respuestas visibles y entra una carga adicional, tambien se mantiene el footer de lista como feedback incremental.
- El boton de imagen es solo visual en esta iteracion: se renderiza como `Button` icon-only con `type="button"`, `variant="outline"`, `size="icon"`, `disabled`, y un nombre accesible explicito como `Adjuntar imagen (proximamente)`.
- Al estar `disabled`, no debe ser interactivo por raton ni teclado, y no debe disparar handlers ni side effects.

## Technical Direction

- `FollowingFeedContent.tsx`
  - Reordenar `nostr-following-feed-header` para que `OverlayPageHeader` quede como contenido principal y las acciones queden en un bloque derecho.
  - Renderizar `Volver al Agora` dentro de `.nostr-following-feed-header-actions` solo en la vista de hilo, dejando `OverlayPageHeader` como primer hijo estructural del header.
  - Detectar el estado de carga inicial del hilo solo cuando `activeThread.isLoading && !activeThread.root && activeThread.replies.length === 0` y renderizar un `Empty` centrado en lugar del footer de lista.
  - Mantener `ListLoadingFooter` para `activeThread.isLoadingMore`, y tambien para cualquier `activeThread.isLoading` que ocurra con `root` o `replies` ya presentes.
  - Cambiar el layout de ambos composers para que el `Textarea` quede encima de una fila con `justify-between`.
  - Usar un boton secundario de icono para imagen en el extremo izquierdo con `disabled` y `aria-label` explicito para dejar claro que todavia no esta disponible.
  - Mantener los botones `Publicar` y `Responder` en el extremo derecho de esa misma fila.
  - El `Empty` de carga inicial del hilo debe usar `Spinner`, titulo `Cargando hilo` y descripcion `Recuperando la conversacion.` para mantener copy determinista y alineado con el resto del overlay.

## Validation Criteria

- En detalle de hilo, `Volver al Agora` queda dentro de `.nostr-following-feed-header-actions` y no antes de `OverlayPageHeader` en el arbol DOM.
- Al abrir un hilo sin contenido aun cargado, se ve un `Empty` centrado con `Spinner` y no un footer con `Cargando hilo...`.
- Si el hilo ya tiene contenido y sigue cargando mas respuestas, el feedback de `load more` sigue apareciendo como footer.
- El composer principal de `Agora` muestra iconbutton de imagen a la izquierda bajo el `Textarea` y `Publicar` a la derecha.
- El composer de respuesta del hilo muestra iconbutton de imagen a la izquierda bajo el `Textarea` y `Responder` a la derecha.
- El boton de imagen aparece deshabilitado y expone el nombre accesible `Adjuntar imagen (proximamente)` en ambos composers.
- La cobertura minima de tests debe verificar: presencia de `Volver al Agora` dentro de `.nostr-following-feed-header-actions`, estado centrado de carga inicial del hilo con `Spinner` cuando `isLoading && !root && replies.length === 0`, ausencia de ese estado cuando la raiz del hilo ya es visible, y presencia de la nueva fila de acciones en el composer principal y en el de respuesta.
