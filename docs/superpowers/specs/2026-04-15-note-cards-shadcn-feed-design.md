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

Se define un modelo común para desacoplar el render de la fuente de datos:

`NoteCardModel` (nombre orientativo)

- `id`, `pubkey`, `createdAt`, `content`, `tags`
- `kindLabel` (ej. `Repost`, `Reply`, `Raiz`)
- `rawEventId` para copy ID y referencias
- `embedded` opcional para nota anidada
- `actions` opcionales (callbacks/flags/métricas)

Adaptadores necesarios:

- `SocialFeedItem -> NoteCardModel`
- `SocialThreadItem -> NoteCardModel`
- `NostrPostPreview -> NoteCardModel`
- evento parseado de repost embebido JSON -> `NoteCardModel`
- `NostrEvent` citado/resuelto (desde referencias) -> `NoteCardModel`

## 5) Flujo para reposts y citas

### 5.1 Repost embebido

Para eventos tipo repost con contenido JSON embebido:

- Se parsea como hoy.
- Se adapta a `NoteCardModel`.
- Se renderiza con `NoteCard` variante `nested` dentro de la nota contenedora.

### 5.2 Nota citada/referenciada

Las referencias `note`/`nevent` resueltas se muestran también con `NoteCard` variante `nested`.

Esto implica que `RichNostrContent` no debe seguir pintando una tarjeta custom separada para referencias si hay evento resuelto; delegará al render de `NoteCard` para conservar formato único.

### 5.3 Límite de anidado

Para evitar recursión visual y problemas de rendimiento:

- nivel 0: nota principal
- nivel 1: nested completo
- nivel 2 o más: fallback compacto (resumen + acción de abrir)

## 6) Integraciones por pantalla

### 6.1 `FollowingFeedContent`

Migrar a `NoteCard` en:

- lista principal (`items.map`)
- raíz de hilo (`activeThread.root`)
- replies (`activeThread.replies`)

Mantener callbacks actuales (`onOpenThread`, `onToggleReaction`, `onToggleRepost`, etc.) pasándolos al modelo de acciones.

### 6.2 `OccupantProfileDialog` (tab feed)

Sustituir `<li className="nostr-profile-post-item">` con contenido custom por `NoteCard` para cada post, usando modo sin acciones mutantes si no hay callbacks de interacción social.

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
  - render de referencias citadas embebidas
  - callback de apertura de referencia
- `OccupantProfileDialog.test.tsx`
  - feed tab renderiza notas con el nuevo formato base
  - referencias citadas mantienen formato consistente

Regla para tests: priorizar asserts funcionales (rol, `aria-label`, callbacks, contenido), evitando acoplarse a detalles frágiles de implementación visual.

## 10) Fuera de alcance

- Cambiar copy de producto o nomenclatura funcional del dominio.
- Rediseñar todo `RichNostrContent` más allá de integrar el render de referencia a `NoteCard`.
- Reestructurar la capa de servicios (`social-feed-service`, queries) salvo adaptadores mínimos para el modelo de render.

## 11) Criterios de aceptación

Se considera completo cuando:

- Todas las notas en Agora (feed/hilo/replies) usan `Card` + `Item` + `ButtonGroup` como base.
- El feed del `OccupantProfileDialog` usa el mismo formato base.
- Reposts y citas anidadas mantienen el mismo formato estructural en modo nested.
- No se rompe la interacción actual (responder, reaccionar, repostear, abrir referencias, copy ID).
- La suite de tests afectada pasa con cobertura de los casos anteriores.
