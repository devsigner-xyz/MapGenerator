# Agora Repost Quote Publish Dialog Design

## Context

El flujo social actual del overlay tiene cuatro problemas conectados:

- al accionar `Repostear` en una nota, el usuario percibe que no se esta publicando nada
- `Repostear` es una accion directa en el boton, pero ahora necesita un menu contextual con `Repost` y `Cita`
- la publicacion principal de `Agora` vive en un composer fijo inferior, pero debe pasar a un dialog global abierto desde el sidebar
- el feedback de acciones sociales no muestra un `toast` consistente al publicar, repostear o citar

Ademas, el cambio no afecta solo a `Agora` principal. Debe abarcar cualquier `NoteCard` reutilizada en:

- la pagina principal de `Agora`
- el detalle de una nota o hilo
- el dialog de detalle de un usuario (`OccupantProfileDialog`)

La exploracion del codigo actual apunta a una causa raiz funcional: `useFollowingFeedController.ts` publica contenido social usando `options.writeGateway`, pero ese gateway solo firma eventos. En el repo ya existe `createPublishForwardApi` y el endpoint `POST /v1/publish/forward`, pero el flujo social actual no parece usarlo para reenviar los eventos firmados a relays sociales. Eso explicaria por que `repost` y potencialmente tambien publicar/responder no terminan apareciendo en la red.

Ademas, el ultimo ajuste del repo ha corregido el render de reposts para que la nota reposted se vea embebida dentro de la tarjeta del repostador, en lugar de renderizarse como una tarjeta hermana separada. Ese cambio pasa a ser la referencia visual que debe seguir `Cita`.

## Scope

Dentro de alcance:

- corregir el pipeline de publicacion social para firmar y reenviar a relays
- introducir un dialog reutilizable para `Publicar` y `Cita`
- reemplazar la accion directa de repost por un context menu `Repost` / `Cita`
- anadir el item `Publicar` al sidebar principal
- eliminar el composer inferior del `Agora` principal
- mantener el composer inferior unicamente para responder dentro del detalle de hilo
- mostrar `toast` de exito o error al publicar, repostear o citar
- cubrir `Agora`, detalle de hilo y dialog de perfil de usuario

Fuera de alcance:

- adjuntos de imagen o multimedia reales
- cambios en zaps, reactions o notificaciones mas alla de las regresiones necesarias
- redisenar el layout general del sidebar o del dialog de perfil
- soporte de edicion de notas ya publicadas

## Goals

- Hacer que `Repost` publique de verdad y ofrezca feedback inmediato de resultado.
- Permitir `Cita` como nota normal con referencia a la nota citada y texto libre del usuario.
- Unificar el entry point de publicacion principal en un dialog global reutilizable.
- Mantener la caja inferior solo para respuestas en el detalle de hilo.
- Aplicar el mismo patron de acciones de nota en feed, hilo y perfil.

## Non-Goals

- No convertir `Cita` en una variante de repost con comentario.
- No crear una pagina nueva dedicada a escribir publicaciones.
- No mover la logica de respuesta del hilo a un dialog.
- No introducir un sistema nuevo de notificaciones global si `sonner` ya cubre el feedback necesario.

## Decision

Se introduce una capa de publicacion social reutilizable y explicita entre el controller del feed y el backend de forwarding:

- la capa firma eventos con `writeGateway`
- la capa reenvia los eventos firmados con `createPublishForwardApi`
- la capa resuelve relays sociales a partir del estado actual de relays del usuario, priorizando `nip65Write` y `nip65Both` con fallback a bootstrap

Sobre esa base se construye una UX unificada:

- el boton de repost deja de ejecutar la mutacion directamente y pasa a abrir un context menu con `Repost` y `Cita`
- `Repost` ejecuta la publicacion inmediatamente y lanza `toast.success` o `toast.error`
- `Cita` abre un dialog compartido con preview de la nota citada y textarea
- el nuevo item `Publicar` del sidebar abre ese mismo dialog sin nota citada
- el composer inline del `Agora` principal desaparece
- el composer inline de respuesta del hilo se mantiene tal y como esta conceptualmente, porque es el unico caso donde la publicacion debe permanecer in situ
- el render final de `Cita` debe reutilizar el mismo patron visual de `repost`: una sola tarjeta padre con nota embebida dentro, no dos tarjetas hermanas

## User Flows

### Publicar desde sidebar

1. El usuario pulsa `Publicar` en el sidebar principal.
2. Se abre un dialog reutilizable de composer en modo `post`.
3. El usuario escribe y confirma.
4. La app firma el evento kind `1`, lo reenvia a relays sociales y actualiza el feed de forma optimista.
5. Se muestra `toast.success('Publicacion enviada')` o `toast.error(...)`.

### Repost directo desde una nota

1. El usuario pulsa el control de repost de una `NoteCard`.
2. Se abre un context menu con `Repost` y `Cita`.
3. Si elige `Repost`, la app publica un repost normal, sin dialog intermedio.
4. Se muestra `toast.success('Repost publicado')` o `toast.error(...)`.

### Cita desde una nota

1. El usuario pulsa el control de repost de una `NoteCard`.
2. Se abre el mismo context menu.
3. Si elige `Cita`, se abre el dialog reutilizable en modo `quote`.
4. El dialog muestra preview de la nota citada y textarea.
5. Al confirmar, la app publica una nota kind `1` con texto libre y referencia a la nota citada.
6. Se muestra `toast.success('Cita publicada')` o `toast.error(...)`.

### Render de una cita ya publicada

1. La app renderiza una sola tarjeta padre para la autora o autor que cita.
2. La tarjeta padre conserva el contenido adicional escrito por quien cita.
3. Dentro de esa misma tarjeta se renderiza la nota citada como nota embebida.
4. La nota citada no debe aparecer como tarjeta top-level hermana ni duplicarse por una segunda via de referencias.

## State Contract

- El estado del dialog global de composer debe vivir por encima de las superficies concretas que disparan la accion, previsiblemente en `App.tsx`.
- El dialog tiene dos modos excluyentes:
  - `post`
  - `quote`
- En modo `quote`, el estado debe incluir la nota objetivo con suficiente informacion para renderizar preview estable: `id`, `pubkey`, `createdAt`, `content`, `tags`, y si existe `kindLabel` o notas referenciadas ya resueltas.
- El detalle de hilo mantiene su estado local de `replyDraft` y `replyTargetEventId`; ese flujo no debe mezclarse con el dialog global.
- El contrato de acciones no cambia en `NoteCard.tsx` directamente, sino en `NoteActionState` de `src/nostr-overlay/components/note-card-model.ts` y en los builders de `src/nostr-overlay/components/following-feed-note-card-mappers.ts`.
- `NoteActionState` debe exponer dos acciones separadas para el control contextual de repost:
  - `onRepost`
  - `onQuote`
- `NoteCard.tsx` solo renderiza `note.actions`; la responsabilidad de construir esas acciones sigue estando en los mappers y en los contenedores padre (`FollowingFeedContent.tsx`, `OccupantProfileDialog.tsx`).
- Los estados optimistas de repost siguen existiendo para el contador y el disabled state mientras la mutacion esta pendiente.
- El feedback por `toast` debe dispararse solo al resolver una accion de usuario:
  - `publishPost`
  - `publishQuote`
  - `toggleRepost` cuando se cree o elimine un repost
- Los errores deben priorizar el mensaje real de la excepcion y caer a un fallback legible si no existe.
- El `publishError` inline que hoy renderiza `FollowingFeedContent.tsx` deja de ser el mecanismo principal de feedback para publicar, repostear o citar. Para estas acciones, el feedback visible debe vivir en `toast`; si se mantiene `publishError` internamente, no debe mostrarse ademas como banner duplicado.
- El modelo visual compartido para `repost` y `cita` pasa a ser `parent note + embedded child note` mediante `NoteCardModel.embedded` o una abstraccion equivalente centralizada; no debe quedar limitado a una transformacion ad hoc de `FollowingFeedContent.tsx`.

## Technical Direction

- `src/nostr-overlay/hooks/useFollowingFeedController.ts`
  - dejar de depender de un `WriteGatewayLike` que solo firma
  - pasar a depender de una abstraccion de publicacion social que firme y luego forwardee
  - mantener la logica optimista actual de feed, hilo, reactions y reposts, pero encapsulando la entrega real del evento publicado
  - extender la API publica del controller para exponer una accion adicional de cita, separada del repost directo

- `src/nostr-overlay/query/following-feed.mutations.ts`
  - ampliar los tipos de entrada y salida para soportar cita como nota kind `1` con tags de referencia
  - introducir helpers especificos para construir tags de cita si no existen aun
  - mantener `sanitizeContent` como normalizacion comun para post, quote y reply
  - definir un helper claro para resolver la representacion local de una cita sin duplicar la nota citada en el renderer

- `src/nostr-api/publish-forward-api.ts`
  - reutilizar el cliente ya existente, pero consumirlo desde un publicador social que reciba un `HttpClient` autenticado (`bffClient`) en lugar del cliente por defecto sin auth headers

- `src/nostr-overlay/hooks/useNostrOverlay.ts`
  - crear el publicador social con acceso a:
    - `writeGateway`
    - `bffClient`
    - resolucion de relays sociales desde configuracion actual del usuario
  - exponer esa capacidad al resto del overlay junto al resto de servicios social/dm

- `src/nostr-overlay/App.tsx`
  - alojar el estado del dialog global de composer y el trigger desde sidebar
  - pasar callbacks a `FollowingFeedSurface`, detalle de hilo y `OccupantProfileDialog`
  - disparar `toast.success` / `toast.error` para publicar, repostear y citar
  - actualizar el orden de items del sidebar para insertar `Publicar` tras `Agora`

- `src/nostr-overlay/components/OverlaySidebar.tsx`
  - insertar un nuevo `SidebarMenuItem` para `Publicar`
  - mostrarlo solo cuando el usuario pueda escribir
  - mantener el orden estable del resto de acciones

- `src/nostr-overlay/components/FollowingFeedContent.tsx`
  - eliminar el composer inferior principal del feed cuando `activeThread === null`
  - dejar de mantener `postDraft` y el flujo visual del composer principal dentro de esta vista
  - conservar unicamente el composer inferior de respuesta cuando `activeThread !== null`
  - aceptar y propagar el nuevo `NoteActionState` para que las notas del feed e hilo puedan delegar en `Repost` y `Cita` construidos por sus contenedores padre
  - no introducir un segundo camino exclusivo de `FollowingFeedContent` para `Cita`; el render de cita debe salir de un contrato reutilizable compartido con el resto de superficies

- `src/nostr-overlay/components/OccupantProfileDialog.tsx`
  - reutilizar la misma accion de repost/cita para las notas del perfil
  - no introducir composer fijo dentro del dialog

- `src/nostr-overlay/components/note-card-model.ts`
  - sustituir el contrato de accion unica `onToggleRepost` por un contrato que permita menu contextual de repost
  - mantener backward compatibility interna solo si es estrictamente necesaria durante la transicion de tests; la implementacion final debe dejar un contrato claro y unico
  - consolidar el uso de `embedded` como primitiva compartida para renderizar `repost` y `cita` cuando una nota deba envolver otra nota

- `src/nostr-overlay/components/following-feed-note-card-mappers.ts`
  - mapear `Repost` y `Cita` por separado para feed, hilo y preview de perfil

- `src/nostr-overlay/components/NoteCard.tsx`
  - reemplazar la accion directa del boton de repost por un `ContextMenu` o patron equivalente ya usado en el overlay
  - el menu debe contener exactamente `Repost` y `Cita`
  - el estado pending debe seguir deshabilitando la accion mientras haya mutacion activa

- dialog nuevo reutilizable
  - crear un componente nuevo en `src/nostr-overlay/components/` para el composer modal de `post` y `quote`
  - reutilizar `Dialog`, `Textarea`, `Button` y `NoteCard`/preview existente para no inventar un patron visual nuevo
  - el dialog debe poder resetear draft y estado al cerrar

## Quote Rendering Contract

- `Cita` se renderiza como una sola tarjeta padre del autor que cita.
- Esa tarjeta padre debe mostrar:
  - identidad del autor que cita
  - fecha de publicacion de la cita
  - contenido adicional escrito por quien cita
  - la nota citada embebida dentro de la misma tarjeta
- La nota citada no debe renderizarse como una tarjeta top-level hermana.
- La nota citada no debe renderizarse dos veces cuando el evento de cita contenga tanto una referencia de contenido como metadatos suficientes para resolver la nota objetivo.
- El origen de verdad del render debe ser unico por tarjeta citada:
  - o `NoteCardModel.embedded`
  - o referencias resueltas desde contenido
  - pero no ambos para la misma cita en la misma superficie.
- Esta regla debe cumplirse de forma consistente en:
  - feed de `Agora`
  - detalle de hilo
  - feed del dialog de perfil

## Relay And Publish Rules

- Toda publicacion social debe terminar en relays, no solo firmada localmente.
- El publicador social debe:
  - firmar con `writeGateway.publishEvent`
  - forwardear el evento firmado con `createPublishForwardApi({ client: bffClient })`
  - usar `relayScope: 'social'`
  - resolver relays sociales desde la configuracion del usuario, priorizando escritura (`nip65Write`) y mixtos (`nip65Both`), con fallback a bootstrap relays cuando no haya ninguno valido
- Una publicacion se considera exitosa si y solo si `ackedRelays.length > 0` en el `PublishResult` devuelto por `/publish/forward`.
- Si `ackedRelays.length === 0`, la accion se considera fallida aunque existan `timeoutRelays` o no haya explotado la llamada HTTP.
- Los tests deben verificar de forma explicita que el forwarding recibe `{ relayScope: 'social', relays, event }`.

## Quote Format

- `Cita` se publica como nota kind `1`, no como kind `6`.
- Debe incluir:
  - el texto escrito por el usuario
  - una referencia `nostr:nevent...` en `content`, porque el renderer actual ya soporta y testea referencias `nevent` en `RichNostrContent`
  - tags de evento/persona necesarias para compatibilidad (`e` y `p` como minimo cuando aplique), sin convertir la cita en repost comentado
- La implementacion no debe dejar este formato abierto a decidir mas tarde.
- Aunque el wire format incluya `nostr:nevent...`, el renderer local de la app debe resolver la cita con una sola nota embebida visible y suprimir cualquier doble render del mismo objetivo citado.
- A nivel visual, `Cita` se comporta como un repost con comentario: tarjeta padre con contenido propio mas tarjeta embebida de la nota citada.

## Repost Menu Rules

- El menu del control de repost muestra siempre dos items visibles: `Repost` y `Cita`.
- `Repost` conserva la semantica de toggle ya existente en el controller:
  - si la nota aun no esta reposted localmente, publica kind `6`
  - si la nota ya esta reposted localmente, elimina el repost mediante el path actual de kind `5`
- El item sigue llamandose `Repost` en ambos casos; el estado activo se representa por el estado visual actual del control, no por un tercer item nuevo en el menu.
- `Cita` siempre abre el dialog y nunca elimina un repost existente.

## Toast Contract

- Exitos:
  - `Publicacion enviada`
  - `Repost publicado`
  - `Repost eliminado`
  - `Cita publicada`
- Errores:
  - reutilizar `error.message` cuando exista
  - si no existe, usar un fallback especifico por accion:
    - `No se pudo publicar la nota`
    - `No se pudo publicar el repost`
    - `No se pudo publicar la cita`
- Los toasts deben emitirse una sola vez por accion, no desde multiples capas a la vez.

## Validation Criteria

- El composer inferior ya no aparece en la vista principal de `Agora`.
- El composer inferior sigue apareciendo en el detalle de hilo para responder.
- El sidebar principal muestra `Publicar` inmediatamente despues de `Agora` y antes de `Chats` cuando `canWrite === true`; no lo muestra cuando `canWrite === false`.
- El control de repost de cualquier `NoteCard` abre un menu con `Repost` y `Cita`.
- `Repost` ejecuta de forma inmediata el toggle de repost sin abrir dialog.
- `Cita` abre un dialog con preview de nota y textarea.
- `Publicar` abre ese mismo dialog en modo vacio.
- Las acciones anteriores funcionan desde:
  - feed de `Agora`
  - detalle de hilo
  - publicaciones del dialog de perfil
- Publicar, repostear y citar muestran `toast` de exito o error.
- La entrega real del evento usa `createPublishForwardApi({ client: bffClient })`, hace `POST` a `/publish/forward` bajo la base `/v1`, y resuelve relays sociales desde la configuracion vigente.
- La cobertura minima de tests debe validar:
  - ausencia del composer principal del feed
  - permanencia del composer de reply en hilo
  - nuevo orden del sidebar con `Publicar`
  - apertura del menu `Repost/Cita`
  - semantica de toggle del item `Repost`
  - apertura del dialog de cita
  - que una cita renderiza exactamente una tarjeta top-level del autor que cita
  - que el contenido adicional del autor que cita permanece visible
  - que la nota citada aparece embebida dentro de esa tarjeta
  - que la nota citada no se duplica ni como hermana ni como segunda referencia embebida
  - toasts de exito/error
  - uso del flujo de publicacion social tanto en post normal como en repost/cita
