# Chat DM 1:1 Overlay Design

## Context

El overlay actual en `src/nostr-overlay/**` ya tiene:

- toolbar con acciones (`settings`, `regenerate`, `city stats`),
- context menu por edificio con accion `Enviar mensaje`,
- modales y estados de perfil,
- autenticacion Nostr con capacidades (`canSign`, `canEncrypt`) via `useNostrOverlay`.

Objetivo: agregar chat real 1:1 en el overlay, con punto rojo de no leidos y apertura directa desde context menu.

## Goals

- Anadir icon button de chat junto a los iconos de toolbar existentes.
- Mostrar indicador global de no leidos con punto rojo.
- Abrir modal de chat con listado de conversaciones y detalle por conversacion.
- Permitir apertura directa del detalle de chat desde `Enviar mensaje` en edificio.
- Implementar mensajeria real sobre Nostr (no mock), preparada para evolucionar a grupos en fase 2.

## Non-Goals

- No implementar grupos en esta iteracion.
- No migrar toda la UI de overlay a otro framework de componentes.
- No introducir backend propio obligatorio para el primer release.

## Product Decisions Validated

- Enfoque tecnico: cliente Nostr puro en tiempo real (sin backend intermediario obligatorio).
- Alcance funcional: DM 1:1 real.
- Indicador de no leidos: punto rojo (sin contador numerico).
- Grupos: pospuestos a fase 2.

## Protocol Decisions (Nostr)

- DM moderno basado en NIP-17 (rumor kind 14) + NIP-59 (kind 13/1059) + NIP-44 v2.
- Mantener compatibilidad de capacidades existentes del auth provider (`encrypt/decrypt`) y gating explicito por soporte `nip44`.
- Publicacion con estrategia de relay inbox/read del destinatario cuando haya metadata disponible, con fallback a relays efectivos de sesion.
- El hilo 1:1 se identifica por peer pubkey (estable) y queda preparado para generalizarse a set de participantes en fase grupos.

Orden de resolucion de relays (determinista):

1. relays inbox/write del destinatario (si existen),
2. relays read del destinatario (fallback),
3. relays activos de la sesion local.

Reglas:

- normalizar URL (`wss://` canonical) y deduplicar.
- limite de intento por envio: maximo 6 relays.
- timeout por relay en publish: 4s.

### NIP Rules (MUST/SHOULD)

- **MUST** aceptar para inbox solo `kind 1059` con `p` tag dirigido al pubkey de la sesion activa.
- **MUST** desenvolver en dos pasos: `kind 1059` (gift wrap) -> `kind 13` (seal) -> rumor `kind 14`.
- **MUST** validar firma de capas firmadas antes de usar contenido (`kind 1059` y `kind 13`).
- **MUST** validar consistencia de autor: `seal.pubkey` debe coincidir con `rumor.pubkey`.
- **MUST** tratar como invalido cualquier evento con estructura incompleta o JSON no parseable en capas internas.
- **MUST** aceptar como DM 1:1 solo rumor `kind 14` con exactamente un `p` tag.
- **MUST** validar direccion 1:1 con matriz explicita:
  - `incoming`: `rumor.pubkey == peerPubkey` y `p == ownerPubkey`.
  - `outgoing`: `rumor.pubkey == ownerPubkey` y `p == peerPubkey`.
  - cualquier otro caso: descartar.
- **SHOULD** incluir `p` tag del destinatario en rumor `kind 14` (chat 1:1: un solo `p`), y `p` tag en `kind 1059` para routing.
- **SHOULD** mantener timestamps de `seal` y `gift wrap` desacoplados del rumor para evitar correlacion temporal.

## UX and Interaction Design

### Toolbar

- Nuevo boton `Abrir chats` en `nostr-panel-toolbar` junto a `settings`, `regenerate`, `city stats`.
- En modo panel colapsado (`nostr-compact-toolbar`) tambien aparece boton de chat.
- Si existe al menos una conversacion no leida, el boton muestra punto rojo.

### Chat Modal

- Modal unico con dos paneles logicos:
  1. lista de conversaciones,
  2. detalle de conversacion activa.
- En desktop: lista + detalle visibles en layout dividido.
- En mobile: navegacion lista -> detalle con boton volver.
- Si no hay conversacion activa al abrir desde toolbar, se muestra listado.

### Open from Context Menu

- Al elegir `Enviar mensaje` en menu contextual de edificio:
  - se abre el modal de chat,
  - se selecciona directamente la conversacion con ese `pubkey`,
  - foco inicial en caja de texto del detalle.

## Architecture

### Layering

1. **Domain Service** (`DmService`): protocolo Nostr DM, subscribe/publish, unwrap/decrypt.
2. **State Store** (`useDirectMessages`): normalizacion de conversaciones, mensajes, no leidos y UI state.
3. **UI Components**: boton chat, modal, listado, detalle.
4. **App Integration**: wiring en `App.tsx` y context menu.

Ownership de subscripcion:

- `useDirectMessages` es el unico owner de `startInboxSubscription/stopInboxSubscription`.
- Debe existir una sola subscripcion activa por `ownerPubkey`.
- Ante reconnect, cambio de sesion o unmount, siempre ejecutar cleanup antes de resuscribir.

### Transport Boundary (required)

La base actual no expone publish/subscribe generico en `NostrClient` (solo `connect/fetchEvents`) y `write-gateway` firma pero no publica por si mismo. Para hacer implementable el flujo DM, se define una nueva frontera de transporte:

- `DmTransport.publishToRelays(event, relayUrls): Promise<PublishResult>`
- `DmTransport.subscribe(filters, onEvent): Unsubscribe`
- `DmTransport.fetchBackfill(filters): Promise<NostrEvent[]>`

`PublishResult`:

- `ackedRelays: string[]`
- `failedRelays: Array<{ relay: string; reason: string }>`
- `timeoutRelays: string[]`

Implementacion prevista:

- Extender `src/nostr/ndk-client.ts` o agregar `src/nostr/dm-transport-ndk.ts` con publish/subscribe/backfill.
- Mantener `write-gateway` como capa de firma/cifrado (no transporte).

### Main Components

- `src/nostr-overlay/hooks/useDirectMessages.ts`
  - estado de conversaciones y mensajes,
  - acciones de abrir listado/detalle,
  - `sendMessage`, `markConversationRead`, `hasUnreadGlobal`.
- `src/nostr/dm-service.ts`
  - `startInboxSubscription`, `stopInboxSubscription`,
  - `sendDm`, `loadConversationHistory`,
  - `unwrapGiftWrapEvent` + validaciones.
- `src/nostr/dm-transport.ts`
  - contrato de publish/subscribe/fetch para desacoplar protocolo de infraestructura.
- `src/nostr-overlay/components/ChatModal.tsx`
- `src/nostr-overlay/components/ChatConversationList.tsx`
- `src/nostr-overlay/components/ChatConversationDetail.tsx`

## Data Model

### Conversation

- `id` (1:1: peer pubkey),
- `peerPubkey`,
- `peerProfile` (nombre/avatar si disponible),
- `lastMessageAt`,
- `lastMessagePreview`,
- `hasUnread`.

### Message

- `id` (estable para UI, puede iniciar temporal y consolidarse con event id),
- `clientMessageId` (uuid local estable para reconciliar reintentos),
- `conversationId`,
- `direction` (`incoming` | `outgoing`),
- `createdAt`,
- `plaintext`,
- `eventId`,
- `giftWrapEventId`,
- `sealEventId`,
- `rumorEventId`,
- `deliveryState` (`pending` | `sent` | `failed`).

### Canonical Identity and Ordering

- Dedupe canonico por `rumorEventId` cuando exista.
- Fallback de dedupe en entrada parcial: `sealEventId` y hash de contenido decodificado.
- Ordenado visual por `rumor.created_at` (no por `gift wrap created_at`).
- Tie-break estable: `rumorEventId` lexicografico.

### Read Tracking

- Todos los timestamps de DM/read state se almacenan y comparan en `epoch seconds` (int).
- `lastReadAtByConversation[conversationId]` persistido en localStorage.
- `hasUnread` de conversacion: existe mensaje `incoming.createdAt > lastReadAt`.
- Punto rojo global: `some(conversation.hasUnread)`.

Regla para mensajes no desencriptables:

- cuentan como `incoming` para no leidos,
- se marcan leidos al abrir la conversacion (misma regla de timestamp),
- se renderizan como placeholder de error sin bloquear el resto del hilo.

#### Storage Key Schema

- Clave versionada y aislada por usuario: `nostr-overlay:dm:v1:seen:<ownerPubkey>:<conversationId>`.
- En cambio de version (`v2+`), migracion best-effort: leer v1, escribir v2, luego limpiar v1.

## State and Event Flow

### Send

1. Usuario envia texto en detalle.
2. Store agrega mensaje `pending` optimista.
3. `DmService.sendDm` construye rumor -> seal -> gift wrap y publica.
4. Al exito: `pending -> sent` y se consolida metadata.
5. Al fallo: `pending -> failed` con opcion de reintento.

Regla anti-duplicados en reintentos:

- los reintentos **MUST** reutilizar el mismo `clientMessageId` y el mismo rumor logico (`rumorEventId`),
- se reintenta publicacion de wraps/transporte, no se crea una nueva burbuja de mensaje.

Condicion de envio:

- solo habilitado con sesion writable y `isEncryptionEnabled(session, 'nip44') === true`.

Regla de exito/fallo de entrega:

- algoritmo fijo y testeable:
  - `maxAttempts = 3` (1 intento inicial + 2 reintentos),
  - delays entre intentos: `500ms`, `1500ms`,
  - timeout por relay y por intento: `4s`,
  - si existen relays de tier 1/2 para destinatario, `sent` requiere `>=1` ACK en tier 1/2,
  - si no existen relays de tier 1/2, `sent` requiere `>=1` ACK en cualquier relay objetivo,
  - `failed` si termina `maxAttempts` con `ackedRelays.length === 0`.

### Receive

1. `DmService` mantiene suscripcion a inbox DM de sesion actual.
2. Cada `gift wrap` recibido se desenvuelve y valida.
3. Store deduplica por identidad canonica (`rumorEventId` primero), inserta ordenado por `rumor.created_at`.
4. Si detalle de esa conversacion no esta activo, marca no leido.

Backfill e historial saliente:

- En inicio de sesion, ejecutar `fetchBackfill` con ventana fija de 7 dias para recuperar historial reciente.
- En reconexion, ejecutar `fetchBackfill` con ventana fija de 15 minutos para cerrar huecos de tiempo real.

Filtros y estrategia normativa para fase 1:

- **A (inbox obligatorio):** `kinds:[1059]`, `#p:[ownerPubkey]`, `since:<ts>`.
- **B (salientes en red):** `kinds:[1059]`, `#p:[peerPubkey]`, `since:<ts>` sobre relays objetivo usados para publish del hilo.
- **C (fallback local):** indice persistido (`nostr-overlay:dm:v1:sent-index:<ownerPubkey>`) para resiliencia offline.
- En B, conservar solo eventos cuya carga desencriptada pase validacion de direccion `outgoing` (`rumor.pubkey == ownerPubkey` y `p == peerPubkey`).
- Si la copia propia no aparece en relay, el mensaje saliente se reconstruye desde indice local y estado `deliveryState`.
- Merge final: A + B + C, dedupe por identidad canonica + orden por `rumor.created_at`.

Schema del sent-index (`nostr-overlay:dm:v1:sent-index:<ownerPubkey>`):

- item: `{ clientMessageId, conversationId, rumorEventId, sealEventId?, giftWrapEventId?, createdAtSec, deliveryState, targetRelays[] }`.
- retencion: max 30 dias o max 2_000 items (lo que ocurra primero).
- GC: ejecutar en cada arranque de sesion DM y despues de cada envio exitoso.
- migracion: versionado por prefijo `v1`; al introducir `v2`, migrar best-effort y eliminar claves `v1` obsoletas.

### Mark Read

- Al abrir detalle de una conversacion, actualizar `lastReadAt` al timestamp maximo visible (normalizado a epoch seconds).
- Recalcular `hasUnread` de esa conversacion y punto rojo global.

## Integration Points in Existing Code

- `src/nostr-overlay/App.tsx`
  - boton de chat en toolbar completo y compacto,
  - montaje del nuevo modal,
  - handler para abrir chat por `pubkey` desde context menu.
- `src/nostr-overlay/hooks/useNostrOverlay.ts`
  - exponer señales necesarias de sesion/capacidades para DM,
  - conservar responsabilidad actual de auth/map/overlay state.
- `src/nostr/write-gateway.ts`
  - mantener como firma/cifrado.
  - no asumir publicacion en relays en esta capa.
- `src/nostr/dm-transport-ndk.ts`
  - implementar publicacion y suscripcion real en relays.
- `src/nostr-overlay/styles.css`
  - estilos de boton chat, badge rojo y layout de modal.

## Error Handling and Fallbacks

- Sesion sin cifrado (`canEncrypt=false`):
  - permitir abrir modal/listado,
  - bloquear envio con mensaje claro y CTA para login compatible (`nsec`, `nip07`, `nip46`).
- Sesion con cifrado pero sin `nip44`:
  - bloquear envio DM NIP-17,
  - mensaje explicito: "Tu proveedor no soporta NIP-44; cambia metodo de acceso para chatear".
- Sesion bloqueada o logout durante chat:
  - detener subscripciones activas,
  - marcar composer como disabled,
  - conservar historial en memoria solo lectura.
- Relay temporalmente caido:
  - reintentos acotados en envio,
  - estado `failed` visible en burbuja,
  - opcion `Reintentar`.
- Mensaje no desencriptable:
  - no romper hilo,
  - mostrar placeholder de error para ese item,
  - log tecnico en consola para debugging.
- Reconexion:
  - evitar subscripciones duplicadas al remount,
  - resuscribir con cleanup previo,
  - ejecutar backfill de 15 minutos para cerrar huecos.
- Fallback de apertura desde context menu:
  - si DM module no inicializa, mantener fallback temporal a comportamiento actual (`nostr:npub`) en release inicial.

## Testing Strategy

### Unit

- parsing/unwrap de eventos DM,
- deduplicacion y ordenamiento,
- calculo de no leidos + punto rojo,
- transiciones `pending/sent/failed`.

### Integration (App)

- toolbar muestra boton chat en orden correcto,
- punto rojo aparece/desaparece segun `lastReadAt`,
- click boton chat abre modal en listado,
- click en conversacion abre detalle,
- `Enviar mensaje` en context menu abre detalle directo con ese usuario.

### Regression

- tests existentes de toolbar/context menu siguen en verde tras anadir boton chat.
- typecheck + build sin cambios en mapa/base engine.
- tests de lifecycle: lock/logout/reconnect no dejan subscripciones colgadas ni estados inconsistentes.

## Learnings Applied from Context Benchmarks

- **Snort**: pipeline NIP-17 real + no leidos por `lastRead` local + dedupe por identidad estable de chat.
- **Primal**: separacion de estado global de no leidos vs carga paginada de historial mejora UX/rendimiento.

Estas referencias se usan como guia de patron, no como copia de implementacion.

## Rollout Plan

1. Infraestructura DM (service + tipos + tests unitarios).
2. Store/hook de conversaciones y no leidos.
3. UI modal lista/detalle + boton toolbar + badge.
4. Integracion context menu `Enviar mensaje` -> detalle directo (con fallback `nostr:npub` guardado por feature flag).
5. Hardening (retry, reconnect, errores de decrypt, persistencia read state).
6. Remocion del fallback tras estabilizacion de telemetria/errores.

## Acceptance Criteria

- Existe boton `Abrir chats` junto a iconos de toolbar en modo normal y compacto.
- Se muestra punto rojo cuando hay mensajes no leidos y desaparece al marcar leidos.
- Modal muestra listado de conversaciones y detalle navegable por conversacion.
- `Enviar mensaje` en context menu abre directamente el detalle de chat del usuario objetivo.
- Envio y recepcion DM 1:1 funcionan en tiempo real con sesion compatible de firma/cifrado.
- Con sesion readonly, envio deshabilitado con feedback explicito y sin romper lectura/UI.

## Phase 2 (Groups)

- Disenar grupos en especificacion separada, sobre base DM estabilizada.
- Reusar service/store introduciendo `conversationId` por set de participantes.
- Incorporar reglas de membresia, metadata de grupo y UX de creacion/invitacion.
