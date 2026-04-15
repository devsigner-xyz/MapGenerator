# Diseño: cards de notas con base shadcn en feeds

Fecha: 2026-04-15
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Unificar el render de notas en Agora y en el feed del diálogo de perfil usando componentes shadcn como base, minimizando estilos custom.

Requisitos acordados:

- Cada nota debe basarse en `Card` de shadcn.
- El bloque de identidad (avatar, nombre, fecha y meta) debe usar `Item`.
- Las acciones de nota deben usar `ButtonGroup`.
- Las notas reposteadas o citadas deben conservar el mismo formato, incluyendo casos anidados.
- El mismo formato aplica en:
  - `FollowingFeedContent` (feed principal, raíz de hilo y replies)
  - `OccupantProfileDialog` (tab `feed`)

Excepción explícita de producto:

- La paridad de formato en anidados aplica hasta profundidad 1.
- Desde profundidad 2, se aplica fallback compacto por seguridad de UX/performance.

## 2) Decisión principal

Se implementará un componente reutilizable `NoteCard` para eliminar duplicación y garantizar consistencia visual y estructural.

Se descartan enfoques por pantalla (sin componente común) y enfoques híbridos parciales porque no garantizan paridad de formato entre Agora, hilo, replies, reposts y citas.

## 3) Arquitectura propuesta

### 3.1 Componente base `NoteCard`

Nuevo componente en `src/nostr-overlay/components/NoteCard.tsx` con estructura:

- `Card` / `CardHeader` / `CardContent` / `CardFooter`
- `Item` para cabecera de autor
- `ButtonGroup` para acciones (responder, reaccionar, repostear, zaps)

El componente soporta variantes de contexto:

- `default`: nota en feed principal
- `root`: nota raíz de hilo
- `reply`: respuesta en hilo
- `nested`: nota embebida (repost o cita dentro de otra nota)

Las variantes cambian densidad/espaciado, pero mantienen la misma gramática visual.

### 3.2 Subpartes internas reutilizables

Dentro de `NoteCard` se concentran:

- `NoteHeaderItem` (avatar + identidad + meta)
- `NoteActionGroup` (`ButtonGroup` con acciones)

Esto evita replicar bloques JSX en `FollowingFeedContent` y `OccupantProfileDialog`.

## 4) Modelo de datos de render

Se define un modelo común para desacoplar el render de la fuente de datos.

Contrato final (TypeScript):

```ts
type NoteCardVariant = 'default' | 'root' | 'reply' | 'nested'

interface NoteActionState {
  canWrite: boolean
  isReactionActive: boolean
  isRepostActive: boolean
  isReactionPending: boolean
  isRepostPending: boolean
  replies: number
  reactions: number
  reposts: number
  zapSats: number
  onReply: () => void
  onToggleReaction: () => Promise<boolean>
  onToggleRepost: () => Promise<boolean>
}

interface NoteCardModel {
  id: string
  pubkey: string
  createdAt: number
  content: string
  tags: string[][]
  variant: NoteCardVariant
  kindLabel?: string
  showCopyId: boolean
  nestingLevel: number
  embedded?: NoteCardModel
  referencedNotes?: NoteCardModel[]
  actions?: NoteActionState
}

interface NoteCardProps {
  note: NoteCardModel
  profilesByPubkey: Record<string, NostrProfile>
  onCopyNoteId?: (noteId: string) => void
  onSelectHashtag?: (hashtag: string) => void
  onSelectProfile?: (pubkey: string) => void
  onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void
  onSelectEventReference?: (eventId: string) => void
  onResolveEventReferences?: (
    eventIds: string[],
    options?: { relayHintsByEventId?: Record<string, string[]> }
  ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void
  eventReferencesById?: Record<string, NostrEvent>
}
```

Ownership:

- `NoteCard` es puramente de presentación y no conoce servicios ni queries.
- Los contenedores (`FollowingFeedContent`, `OccupantProfileDialog`, `RichNostrContent`) son dueños de construir `NoteCardModel` y callbacks.
- `actions` es opcional por diseño para soportar contextos de solo lectura.

Ownership definitivo por responsabilidad:

| Responsabilidad | Dueño |
|---|---|
| Resolver referencias `note`/`nevent` en red | `RichNostrContent` vía callbacks del contenedor |
| Construir `NoteCardModel` desde datos de dominio | adaptadores en `note-card-adapters.ts` |
| Render de card, nested y actions | `NoteCard.tsx` |
| Decidir qué callbacks existen por pantalla | contenedores (`FollowingFeedContent`, `OccupantProfileDialog`) |

Aclaración de límites:

- `NoteCard` puede recibir `onResolveEventReferences`/`eventReferencesById` solo como props de pasarela hacia `RichNostrContent`.
- `NoteCard` no inicia fetch ni gestiona estado de red por cuenta propia.

Límites de arquitectura (ownership por módulo):

- `src/nostr-overlay/components/note-card-model.ts`
  - tipos `NoteCardModel`, `NoteActionState`, `NoteCardVariant`
  - helpers puros de formato (`shortId`, `kindLabel`)
- `src/nostr-overlay/components/note-card-adapters.ts`
  - adaptadores `fromFeedItem`, `fromThreadItem`, `fromPostPreview`, `fromResolvedReferenceEvent`, `fromEmbeddedRepost`
- `src/nostr-overlay/components/NoteCard.tsx`
  - presentación (Card/Item/ButtonGroup) sin lógica de fetch/servicios
- `src/nostr-overlay/components/RichNostrContent.tsx`
  - detecta referencias y delega el render a `NoteCard` usando adaptador

Adaptadores necesarios:

- `SocialFeedItem -> NoteCardModel`
- `SocialThreadItem -> NoteCardModel`
- `NostrPostPreview -> NoteCardModel`
- evento parseado de repost embebido JSON -> `NoteCardModel`
- `NostrEvent` citado/resuelto (desde referencias) -> `NoteCardModel`

## 5) Flujo para reposts y citas

### 5.1 Repost embebido

Para eventos tipo repost con contenido JSON embebido:

- Se parsea con la función actual (`parseEmbeddedRepostEvent`) manteniendo compatibilidad.
- Se adapta a `NoteCardModel`.
- Se renderiza con `NoteCard` variante `nested` dentro de la nota contenedora.

Si falla el parseo JSON embebido:

- No se rompe el render de la nota contenedora.
- Se muestra el contenido original como texto normal en la nota principal.
- No se renderiza bloque `embedded`.
- Se mantiene cobertura de test para este caso.

Regla de coexistencia con citas/referencias:

- Si una nota tiene `embedded` (repost) y además `referencedNotes` (citas), el orden visual es:
  1. contenido principal
  2. bloque `embedded` (si existe)
  3. bloque de referencias citadas
- Límite total de nested visibles por nota: 3 (`1 embedded + hasta 2 referencias`).

Regla de cupo determinista:

- El cupo de 3 aplica a unidades visibles de nested (card completa o fallback compacto).
- El fallback compacto también consume 1 unidad de cupo.
- Si hay más candidatos que cupo, se prioriza en este orden:
  1. `embedded`
  2. `referencedNotes` en orden de aparición
- El excedente se resume con `+N referencias adicionales`.

### 5.2 Nota citada/referenciada

Las referencias `note`/`nevent` resueltas se muestran también con `NoteCard` variante `nested`.

Esto implica que `RichNostrContent` no debe seguir pintando una tarjeta custom separada para referencias si hay evento resuelto; delegará al render de `NoteCard` para conservar formato único.

Política de múltiples referencias:

- Si hay varias referencias en una misma nota, se renderizan todas las resueltas en orden de aparición.
- Límite: máximo 2 referencias renderizadas por nota.
- Si existen más de 2, mostrar al final texto `+N referencias adicionales`.
- Referencias no resueltas conservan fallback de carga/error sin bloquear las demás.

### 5.3 Límite de anidado

Para evitar recursión visual y problemas de rendimiento:

- nivel 0: nota principal
- nivel 1: nested completo
- nivel 2 o más: fallback compacto obligatorio con:
  - etiqueta `Nota referenciada`
  - resumen de contenido truncado a 140 caracteres
  - ID corto (`abcdef12...123456`)
  - botón `Abrir nota referenciada` que ejecuta `onSelectEventReference(eventId)`

Si `onSelectEventReference` no está disponible, el botón no se muestra y queda solo resumen + ID.

## 6) Integraciones por pantalla

Contrato mínimo por adaptador/contexto:

| Adaptador | Campos obligatorios | Defaults obligatorios |
|---|---|---|
| `fromFeedItem` | `id`, `pubkey`, `createdAt`, `content`, `tags`, `variant=default` | `showCopyId=true`, `nestingLevel=0`, `kindLabel` según `kind` |
| `fromThreadItem` (root) | `id`, `pubkey`, `createdAt`, `content`, `tags`, `variant=root` | `showCopyId=true`, `nestingLevel=0`, `kindLabel=Raiz` |
| `fromThreadItem` (reply) | `id`, `pubkey`, `createdAt`, `content`, `tags`, `variant=reply` | `showCopyId=true`, `nestingLevel=0`, `kindLabel=Reply` |
| `fromPostPreview` | `id`, `pubkey`, `createdAt`, `content`, `variant=default` | `tags=[]`, `showCopyId=true`, `nestingLevel=0`, `actions=undefined` |
| `fromEmbeddedRepost` | `id`, `pubkey`, `createdAt`, `content`, `tags`, `variant=nested` | `showCopyId=true`, `nestingLevel=1`, `actions=undefined` |
| `fromResolvedReferenceEvent` | `id`, `pubkey`, `createdAt`, `content`, `tags`, `variant=nested` | `showCopyId=true`, `nestingLevel=1`, `actions=undefined` |

Regla de error de adaptadores:

- Si falta un campo crítico (`id`, `pubkey`, `createdAt`), el adaptador devuelve `null` y el contenedor usa fallback textual sin romper el render.

### 6.1 `FollowingFeedContent`

Migrar a `NoteCard` en:

- lista principal (`items.map`)
- raíz de hilo (`activeThread.root`)
- replies (`activeThread.replies`)

Mantener callbacks actuales (`onOpenThread`, `onToggleReaction`, `onToggleRepost`, etc.) pasándolos al modelo de acciones.

### 6.2 `OccupantProfileDialog` (tab feed)

Sustituir `<li className="nostr-profile-post-item">` con contenido custom por `NoteCard` para cada post, usando modo sin acciones mutantes si no hay callbacks de interacción social.

### 6.3 Matriz de acciones por contexto

| Contexto | Variante | Reply | Reaction | Repost | Zap indicador | Copy ID |
|---|---|---|---|---|---|---|
| Feed principal (Agora) | `default` | visible | visible | visible | visible | visible |
| Raíz de hilo | `root` | visible | visible | visible | visible | visible |
| Reply de hilo | `reply` | visible | visible | visible | visible | visible |
| Repost/cita anidada en feed/hilo | `nested` | oculto | oculto | oculto | oculto | visible |
| Feed en `OccupantProfileDialog` | `default` | oculto | oculto | oculto | oculto | visible |

Regla de habilitación de acciones visibles:

- `disabled = !canWrite || pending correspondiente` para reaction/repost.
- Reply usa callback definido por contexto (`onOpenThread` o set de target en hilo).

Contrato de errores para acciones:

- `onToggleReaction` y `onToggleRepost` deben resolver `true`/`false` y no lanzar al árbol de UI.
- Si internamente hay excepción, el contenedor la captura, revierte estado optimista y retorna `false`.
- Al retornar `false`, la UI debe:
  - limpiar estado `pending`
  - restaurar contador/estado previo
  - mantener la card renderizada sin cambios estructurales
- La notificación (`toast` u otro) queda en el contenedor, no en `NoteCard`.

## 7) Estilos y alcance de custom CSS

Principio: shadcn first.

- Mantener clases custom solo para layout contenedor y pequeños ajustes de integración.
- Reducir gradualmente clases de card específicas (`nostr-following-feed-card*`) que duplican estilos de `Card`, `Item` o `ButtonGroup`.
- Conservar clases de texto enriquecido (`RichNostrContent`) cuando representen comportamiento semántico (links, menciones, hashtags, media).

## 8) Estados, errores y accesibilidad

### 8.1 Estados

- `NoteCard` recibe estado derivado de su contexto (`pending`, `active`, `canWrite`, etc.).
- No centraliza estados globales de pantalla (loading general, empty, etc.).
- Si una referencia no resuelve, mostrar fallback informativo dentro del bloque nested.

Contrato observable para referencias no resueltas:

- Mientras hay intentos disponibles: mostrar estado de carga con texto exacto `Cargando nota referenciada...` y `aria-live="polite"`.
- Al agotar intentos: mostrar texto `No se pudo cargar la nota referenciada.` y el ID corto.
- Si existe `onSelectEventReference`, mostrar botón `Abrir nota referenciada <id>`; si no existe, no se muestra botón.
- Este fallback debe ser verificable por tests funcionales vía texto y `aria-label`.

### 8.2 Accesibilidad

- Mantener `article` por nota.
- Mantener `time` con `dateTime` ISO.
- Acciones dentro de `ButtonGroup` con `aria-label` explícitos.
- Copy ID con `Button` shadcn (no botón HTML custom plano) para foco/teclado consistente.

## 9) Pruebas

Actualizar tests para validar funcionalidad tras el refactor:

- `FollowingFeedSurface.test.tsx`
  - acciones y estados pending
  - render de repost embebido
  - parseo fallido de repost embebido cae a texto sin crashear
  - render de referencias citadas embebidas
  - fallback de anidado en nivel >= 2 con CTA accesible cuando hay callback
  - callback de apertura de referencia
- `OccupantProfileDialog.test.tsx`
  - feed tab renderiza notas con el nuevo formato base
  - referencias citadas mantienen formato consistente
  - no se muestran acciones mutantes en contexto de solo lectura

Regla para tests: priorizar asserts funcionales (rol, `aria-label`, callbacks, contenido), evitando acoplarse a detalles frágiles de implementación visual.

## 10) Fuera de alcance

- Cambiar copy de producto o nomenclatura funcional del dominio.
- Rediseñar todo `RichNostrContent` más allá de integrar el render de referencia a `NoteCard`.
- Reestructurar la capa de servicios (`social-feed-service`, queries) salvo adaptadores mínimos para el modelo de render.

## 11) Criterios de aceptación

Se considera completo cuando:

- Todas las notas en Agora (feed/hilo/replies) usan `Card` + `Item` + `ButtonGroup` como base.
- El feed del `OccupantProfileDialog` usa el mismo formato base.
- Reposts y citas anidadas mantienen el mismo formato estructural en modo nested hasta profundidad 1; desde profundidad >=2 aplica fallback compacto definido en esta spec.
- No se rompe la interacción actual (responder, reaccionar, repostear, abrir referencias, copy ID).
- La suite de tests afectada pasa con cobertura de los casos anteriores.
